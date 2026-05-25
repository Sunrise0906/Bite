"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/lib/actions/profile";

export function ProfileEditForm({
  initialName,
  initialAvatarUrl,
  email,
}: {
  initialName: string | null;
  initialAvatarUrl: string | null;
  email: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  // avatar 加载失败回退到 initial 圆圈，避免 broken-image icon
  const [avatarBroken, setAvatarBroken] = useState(false);

  const display = name || email.split("@")[0] || "未命名用户";

  function handleSave(fd: FormData) {
    startTransition(async () => {
      const r = await updateProfile({ error: null }, fd);
      if (r.error) {
        setError(r.error);
      } else {
        setError(null);
        setEditing(false);
        setSavedFlash(true);
        // 重置 broken 标记，新 URL 重新尝试加载
        setAvatarBroken(false);
        setTimeout(() => setSavedFlash(false), 1500);
      }
    });
  }

  if (!editing) {
    const showImage = avatarUrl && !avatarBroken;
    return (
      <div className="flex items-center gap-4">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            onError={() => setAvatarBroken(true)}
            className="h-14 w-14 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xl font-semibold text-[var(--primary-soft-text)]">
            {display.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-[var(--text-strong)]">
            {display}
          </p>
          <p className="truncate text-sm text-zinc-500">{email}</p>
          {savedFlash && (
            <p className="mt-0.5 text-xs text-emerald-700">已保存 ✓</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          ✎ 编辑
        </button>
      </div>
    );
  }

  return (
    <form action={handleSave} className="flex flex-col gap-3">
      <div>
        <label
          htmlFor="prof_name"
          className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
        >
          显示名字
        </label>
        <input
          id="prof_name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={email.split("@")[0]}
          className="field-input mt-1.5 text-sm"
        />
        <p className="mt-1 text-[11px] text-zinc-500">
          朋友在推荐 / 共享 list 时看到这个名字。留空使用邮箱前缀。
        </p>
      </div>

      <div>
        <label
          htmlFor="prof_avatar"
          className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
        >
          头像 URL（可选）
        </label>
        <input
          id="prof_avatar"
          name="avatar_url"
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://..."
          className="field-input mt-1.5 font-mono text-xs"
        />
        <p className="mt-1 text-[11px] text-zinc-500">
          贴一个公开图片 URL。Phase 5 暂未做上传，先用外链。
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
            setName(initialName ?? "");
            setAvatarUrl(initialAvatarUrl ?? "");
          }}
          disabled={pending}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {pending ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
