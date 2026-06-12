"use client";

import { useState, useTransition } from "react";
import { createListInvite } from "@/lib/actions/invites";
import { CheckIcon } from "@/components/ui/icons";

type State =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "ready"; url: string; expiresAt: string }
  | { phase: "error"; message: string };

export function InviteButton({ listId }: { listId: string }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"co_owner" | "viewer">("co_owner");
  const [state, setState] = useState<State>({ phase: "idle" });
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function generate() {
    setState({ phase: "creating" });
    startTransition(async () => {
      const result = await createListInvite(listId, role);
      if ("error" in result) {
        setState({ phase: "error", message: result.error });
      } else {
        const url = `${window.location.origin}/invite/${result.token}`;
        setState({ phase: "ready", url, expiresAt: result.expires_at });
      }
    });
  }

  function copyUrl() {
    if (state.phase !== "ready") return;
    navigator.clipboard.writeText(state.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function close() {
    setOpen(false);
    setState({ phase: "idle" });
    setCopied(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary px-3 py-1.5 text-xs"
      >
        + 邀请
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-floating)]"
          >
            <h3 className="heading-display text-lg text-[var(--text-strong)]">
              邀请加入 list
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              生成一条单次使用的邀请链接，发给朋友。7 天有效。
            </p>

            {state.phase !== "ready" && (
              <>
                <div className="mt-4">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    角色
                  </label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole("co_owner")}
                      className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        role === "co_owner"
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:border-[var(--primary)]/40"
                      }`}
                    >
                      <div className="font-medium">共同所有者</div>
                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                        能加 / 改 / 删店
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("viewer")}
                      className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        role === "viewer"
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:border-[var(--primary)]/40"
                      }`}
                    >
                      <div className="font-medium">查看者</div>
                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                        只读
                      </div>
                    </button>
                  </div>
                </div>

                {state.phase === "error" && (
                  <p role="alert" className="mt-3 alert-error">
                    {state.message}
                  </p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={generate}
                    disabled={pending}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    {pending ? "生成中..." : "生成链接"}
                  </button>
                </div>
              </>
            )}

            {state.phase === "ready" && (
              <>
                <div className="mt-4">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    邀请链接
                  </label>
                  <input
                    readOnly
                    value={state.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="field-input mt-1.5 font-mono text-xs"
                  />
                  <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                    过期时间：{new Date(state.expiresAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    onClick={copyUrl}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    {copied ? (
                      <>
                        已复制
                        <CheckIcon size={12} />
                      </>
                    ) : (
                      "复制链接"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
