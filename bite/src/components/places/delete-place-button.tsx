"use client";

import { deletePlace } from "@/lib/actions/places";

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
        className="text-sm text-red-700 hover:underline dark:text-red-400"
      >
        删除店铺
      </button>
    </form>
  );
}
