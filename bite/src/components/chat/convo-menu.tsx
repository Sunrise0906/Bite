"use client";

import { useRef, useState, useTransition } from "react";
import {
  deleteConversationAction,
  renameConversationAction,
} from "@/lib/actions/conversations";

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
        type="button"
        onClick={trigger}
        disabled={pendingDelete || renamePending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="会话操作"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white hover:text-[var(--text-strong)] disabled:opacity-50"
      >
        {/* 用纵向三点跟标题 truncate 的水平 "..." 区分开，肉眼一看就知道是按钮 */}
        <span aria-hidden="true" className="text-base leading-none">⋮</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            role="menu"
            className="absolute right-1 top-7 z-40 min-w-[7rem] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-elevated)] py-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onRename}
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-default)] hover:bg-[var(--surface-muted)]"
            >
              <span aria-hidden="true">✎</span>
              <span>重命名</span>
            </button>
            <button
              type="button"
              onClick={onDelete}
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-[var(--surface-muted)]"
            >
              <span aria-hidden="true">🗑</span>
              <span>删除</span>
            </button>
          </div>
        </>
      )}

      {renaming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setRenaming(false)}
        >
          <form
            action={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
          >
            <h3 className="mb-3 text-sm font-semibold">重命名会话</h3>
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
              <p role="alert" className="mt-2 text-xs text-red-700">
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
        </div>
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
