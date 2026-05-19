"use client";

import { useActionState, useState } from "react";
import { renameList } from "@/lib/actions/lists";

export function RenameListForm({
  id,
  currentName,
}: {
  id: string;
  currentName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(renameList, { error: null });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-2xl font-semibold tracking-tight outline-none hover:opacity-70"
      >
        {currentName}
        <span className="ml-2 align-middle text-sm font-normal text-zinc-400">
          ✎
        </span>
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (!state.error) setEditing(false);
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <input type="hidden" name="id" value={id} />
        <input
          type="text"
          name="name"
          defaultValue={currentName}
          autoFocus
          required
          maxLength={80}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          取消
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
