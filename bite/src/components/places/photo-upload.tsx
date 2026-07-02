"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { uploadPhoto } from "@/lib/actions/photos";
import { CameraIcon, CheckIcon, XIcon } from "@/components/ui/icons";

type PendingStatus = "uploading" | "done" | "error";

type Pending = {
  id: string;
  name: string;
  previewUrl: string;
  status: PendingStatus;
  error?: string;
};

type Props = {
  /**
   * 每张上传成功回调。url 是 canonical URL（落库/写进表单字段用）；
   * displayUrl 是 signed 预览 URL（bucket 私有后 canonical 打不开，img 用它）。
   */
  onUploaded: (url: string, displayUrl: string) => void;
  className?: string;
  /** 单次/总数上限，默认 9 张（对齐小红书） */
  maxFiles?: number;
  /** 父表单当前已有的图片数量，用于计算可继续上传的余量 */
  currentCount?: number;
  disabled?: boolean;
};

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 上传一/多张图片到 Storage，每张成功后通过 onUploaded 把 public URL 回传给父表单。
 * 不负责持久化也不渲染已存图片列表 —— 父组件用现成的 PhotoCarousel/textarea 展示。
 *
 * v1 仅文件选择器（无 drag-and-drop），并发上限 3 避免对 Supabase 拍太狠。
 */
export function PhotoUpload({
  onUploaded,
  className,
  maxFiles = 9,
  currentCount = 0,
  disabled,
}: Props) {
  const [pendings, setPendings] = useState<Pending[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, maxFiles - currentCount);

  // 卸载/清理时释放 object URL，避免内存泄漏
  useEffect(() => {
    return () => {
      pendings.forEach((p) => {
        try {
          URL.revokeObjectURL(p.previewUrl);
        } catch {
          // ignore
        }
      });
    };
    // 仅在卸载时跑；intentionally empty deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updatePending(id: string, patch: Partial<Pending>) {
    setPendings((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  function removePending(id: string) {
    setPendings((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          // ignore
        }
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  async function uploadOne(p: Pending, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const result = await uploadPhoto(fd);
      if (result.ok) {
        onUploaded(result.public_url, result.display_url);
        updatePending(p.id, { status: "done" });
        // done 的稍等淡出（保留 800ms 让用户看见成功）
        setTimeout(() => removePending(p.id), 800);
      } else {
        updatePending(p.id, { status: "error", error: result.error });
      }
    } catch (err) {
      updatePending(p.id, {
        status: "error",
        error: err instanceof Error ? err.message : "上传异常",
      });
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setWarning(null);

    let files = Array.from(fileList);
    if (files.length > remaining) {
      setWarning(
        `最多再上传 ${remaining} 张（已选 ${files.length} 张，超额已忽略）`,
      );
      files = files.slice(0, remaining);
    }
    if (files.length === 0) {
      return;
    }

    // 先把所有 pending 占位放进去（一次性 setState 减少抖动）
    const queue: Array<{ p: Pending; file: File }> = files.map((file) => {
      const id = genId();
      const previewUrl = URL.createObjectURL(file);
      return {
        p: {
          id,
          name: file.name,
          previewUrl,
          status: "uploading" as const,
        },
        file,
      };
    });
    setPendings((prev) => [...prev, ...queue.map((q) => q.p)]);

    // 并发上限 3，简单的 chunk-loop
    const CONCURRENCY = 3;
    startTransition(async () => {
      for (let i = 0; i < queue.length; i += CONCURRENCY) {
        const chunk = queue.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(({ p, file }) => uploadOne(p, file)));
      }
    });
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    // 同名文件再选也能触发
    e.target.value = "";
  }

  function onRetry(id: string) {
    // 重试需要原 File，因 File 已不在 state；提示用户重新选即可
    removePending(id);
    inputRef.current?.click();
  }

  const noRemaining = remaining <= 0;

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onInputChange}
        disabled={disabled || noRemaining || isPending}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || noRemaining}
        className="btn-secondary w-full justify-center border-dashed py-3 text-sm"
      >
        <CameraIcon size={16} className="text-[var(--text-muted)]" />
        {noRemaining
          ? `已达上限 (${maxFiles} 张)`
          : `上传图片（剩 ${remaining} 张 / 共 ${maxFiles}）`}
      </button>

      {warning && (
        <p className="mt-1.5 text-xs text-[var(--gold-text)]">{warning}</p>
      )}

      {pendings.length > 0 && (
        <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {pendings.map((p) => (
            <li
              key={p.id}
              className={`relative aspect-square overflow-hidden rounded-md border ${
                p.status === "error"
                  ? "border-[var(--danger)] ring-1 ring-[var(--danger)]/40"
                  : "border-[var(--border-subtle)]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewUrl}
                alt={p.name}
                className={`h-full w-full object-cover ${
                  p.status === "uploading" ? "opacity-50" : ""
                }`}
              />
              {p.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="animate-pulse rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    上传中
                  </span>
                </div>
              )}
              {p.status === "done" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] p-1 text-[var(--primary-foreground)]">
                    <CheckIcon size={12} strokeWidth={2.6} />
                  </span>
                </div>
              )}
              {p.status === "error" && (
                <>
                  <div
                    title={p.error ?? "上传失败"}
                    className="absolute inset-x-0 bottom-0 truncate bg-[var(--danger)]/85 px-1 py-0.5 text-[10px] text-white"
                  >
                    {p.error ?? "失败"}
                  </div>
                  <div className="absolute right-1 top-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => onRetry(p.id)}
                      className="rounded bg-black/60 px-1 text-[10px] text-white hover:bg-black/80"
                      aria-label="重试"
                    >
                      重试
                    </button>
                    <button
                      type="button"
                      onClick={() => removePending(p.id)}
                      className="inline-flex items-center justify-center rounded bg-black/60 p-0.5 text-white hover:bg-black/80"
                      aria-label="移除"
                    >
                      <XIcon size={11} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
