"use client";

import { useRef, useState, useTransition } from "react";
import { deletePlace } from "@/lib/actions/places";
import { TrashIcon } from "@/components/ui/icons";

export function PlaceCardMenu({
  placeId,
  listId,
  placeName,
}: {
  placeId: string;
  listId: string;
  placeName: string;
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
    if (!window.confirm(`确认删除 "${placeName}"？此操作无法撤销。`)) return;
    setOpen(false);
    startTransition(() => {
      formRef.current?.requestSubmit();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onTrigger}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="店铺操作菜单"
        className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)] disabled:opacity-50"
      >
        {pending ? (
          <span className="text-sm">…</span>
        ) : (
          <span aria-hidden="true" className="text-base leading-none">
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
            className="absolute right-0 top-8 z-40 min-w-[8rem] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] py-1 shadow-[var(--shadow-card-hover)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onDelete}
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger-bg)]"
            >
              <TrashIcon size={14} className="shrink-0" />
              <span>删除店铺</span>
            </button>
          </div>
        </>
      )}

      <form ref={formRef} action={deletePlace} className="hidden">
        <input type="hidden" name="place_id" value={placeId} />
        <input type="hidden" name="list_id" value={listId} />
      </form>
    </div>
  );
}
