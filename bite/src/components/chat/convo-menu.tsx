"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  deleteConversationAction,
  renameConversationAction,
} from "@/lib/actions/conversations";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";

export function ConvoMenu({
  conversationId,
  currentTitle,
}: {
  conversationId: string;
  currentTitle: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [pendingDelete, startDelete] = useTransition();
  const [renamePending, startRename] = useTransition();
  const [renameError, setRenameError] = useState<string | null>(null);
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 菜单按钮的视口坐标，open 时算
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 4,
      // 菜单右边对齐按钮右边
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  function handleRenameSubmit(fd: FormData) {
    startRename(async () => {
      const result = await renameConversationAction({ error: null }, fd);
      if (result.error) {
        setRenameError(result.error);
      } else {
        setRenameError(null);
        setRenaming(false);
      }
    });
  }

  function trigger(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  }

  function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("删除这个对话？无法撤销。")) return;
    setOpen(false);
    startDelete(() => {
      deleteFormRef.current?.requestSubmit();
    });
  }

  function onRename(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    setRenaming(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={trigger}
        disabled={pendingDelete || renamePending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="会话操作"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text-strong)] disabled:opacity-50"
      >
        {/* 用纵向三点跟标题 truncate 的水平 "..." 区分开，肉眼一看就知道是按钮 */}
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="5" r="0.8" />
          <circle cx="12" cy="12" r="0.8" />
          <circle cx="12" cy="19" r="0.8" />
        </svg>
      </button>

      {/* dropdown 用 portal 渲染到 document.body，逃出侧栏 overflow-y-auto 的裁剪 */}
      {open &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <div
              role="menu"
              style={{
                position: "fixed",
                top: anchor.top,
                right: anchor.right,
                zIndex: 70,
              }}
              className="min-w-[7rem] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] py-1 shadow-[var(--shadow-card-hover)]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={onRename}
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-default)] hover:bg-[var(--surface-muted)]"
              >
                <PencilIcon size={13} className="text-[var(--text-muted)]" />
                <span>重命名</span>
              </button>
              <button
                type="button"
                onClick={onDelete}
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)]"
              >
                <TrashIcon size={13} />
                <span>删除</span>
              </button>
            </div>
          </>,
          document.body,
        )}

      {renaming &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4"
            onClick={() => setRenaming(false)}
          >
            <form
              action={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 shadow-xl"
            >
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-strong)]">
                重命名会话
              </h3>
              <input type="hidden" name="id" value={conversationId} />
              <input
                type="text"
                name="title"
                defaultValue={currentTitle ?? ""}
                autoFocus
                required
                maxLength={80}
                className="field-input w-full text-sm"
                placeholder="给这个对话起个名字"
              />
              {renameError && (
                <p role="alert" className="mt-2 text-xs text-[var(--danger-text)]">
                  {renameError}
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenaming(false)}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={renamePending}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  {renamePending ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      <form
        ref={deleteFormRef}
        action={deleteConversationAction}
        className="hidden"
      >
        <input type="hidden" name="id" value={conversationId} />
      </form>
    </>
  );
}
