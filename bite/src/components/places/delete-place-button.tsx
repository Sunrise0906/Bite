"use client";

import { deletePlace } from "@/lib/actions/places";
import { TrashIcon } from "@/components/ui/icons";

export function DeletePlaceButton({
  placeId,
  listId,
  name,
}: {
  placeId: string;
  listId: string;
  name: string;
}) {
  return (
    <form
      action={deletePlace}
      onSubmit={(e) => {
        if (!window.confirm(`确认删除 "${name}"？此操作无法撤销。`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="place_id" value={placeId} />
      <input type="hidden" name="list_id" value={listId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2 text-sm font-medium text-[var(--danger-text)] transition-colors hover:bg-[var(--danger-bg)]"
      >
        <TrashIcon size={14} />
        删除店铺
      </button>
    </form>
  );
}
