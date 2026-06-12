"use client";

import { useState, useTransition } from "react";
import { updatePlaceStatus } from "@/lib/actions/places";
import type { PlaceStatus } from "@/lib/db/types";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";

const STATUS_OPTIONS: Array<{ value: PlaceStatus; label: string; chip: string }> = [
  { value: "want_to_go", label: "想去", chip: "chip chip-want" },
  { value: "visited", label: "已去过", chip: "chip chip-visited" },
  { value: "archived", label: "归档", chip: "chip chip-archived" },
];

export function StatusQuickToggle({
  placeId,
  listId,
  currentStatus,
  chipClass,
}: {
  placeId: string;
  listId: string;
  currentStatus: PlaceStatus;
  chipClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<PlaceStatus>(currentStatus);
  const current = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];

  function pick(next: PlaceStatus) {
    setOpen(false);
    if (next === status) return;
    const prev = status;
    setStatus(next); // optimistic
    startTransition(async () => {
      const r = await updatePlaceStatus(placeId, listId, next);
      if (!r.ok) setStatus(prev); // rollback
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={pending}
        className={`${chipClass} cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="点击切换状态"
      >
        {pending ? (
          "…"
        ) : (
          <>
            {current.label}
            <ChevronDownIcon size={10} className="opacity-70" />
          </>
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
          <ul
            role="listbox"
            className="absolute right-0 top-full z-40 mt-1 min-w-[7rem] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] py-1 shadow-[var(--shadow-card-hover)]"
            onClick={(e) => e.stopPropagation()}
          >
            {STATUS_OPTIONS.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pick(o.value);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface-muted)] ${
                    o.value === status
                      ? "font-medium text-[var(--primary)]"
                      : "text-[var(--text-default)]"
                  }`}
                >
                  <span>{o.label}</span>
                  {o.value === status && (
                    <CheckIcon size={12} className="shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
