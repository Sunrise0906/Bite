"use client";

import { deleteList } from "@/lib/actions/lists";

export function DeleteListButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <form
      action={deleteList}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `确认删除 list "${name}"？这会同时删除其中所有的店铺记录与造访日志，且无法撤销。`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-sm text-red-700 hover:underline dark:text-red-400"
      >
        删除 list
      </button>
    </form>
  );
}
