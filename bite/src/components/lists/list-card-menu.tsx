"use client";

import { useRef, useState, useTransition } from "react";
import { deleteList } from "@/lib/actions/lists";

export function ListCardMenu({
  listId,
  listName,
  placeCount,
}: {
  listId: string;
  listName: string;
  placeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onTrigger(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  }

  function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const msg =
      placeCount > 0
        ? `确认删除 list "${listName}"？这会同时删除其中 ${placeCount} 家店与造访日志，无法撤销。`
        : `确认删除 list "${listName}"？无法撤销。`;
    if (!window.confirm(msg)) return;
    setOpen(false);
    startTransition(() => {
      formRef.current?.requestSubmit();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onTrigger}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="list 操作菜单"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)] disabled:opacity-50"
      >
        {pending ? (
          <span className="text-sm">…</span>
        ) : (
          <span aria-hidden="true" className="text-lg leading-none">
            ⋯
          </span>
        )}
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
            className="absolute right-2 top-9 z-40 min-w-[8rem] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-elevated)] py-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onDelete}
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-[var(--surface-muted)] dark:text-red-400"
            >
              <span aria-hidden="true">🗑</span>
              <span>删除 list</span>
            </button>
          </div>
        </>
      )}

      {/* 隐藏表单，用于实际触发 server action */}
      <form ref={formRef} action={deleteList} className="hidden">
        <input type="hidden" name="id" value={listId} />
      </form>
    </>
  );
}
