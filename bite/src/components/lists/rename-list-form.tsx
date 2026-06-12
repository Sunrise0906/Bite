"use client";

import { useActionState, useState } from "react";
import { renameList } from "@/lib/actions/lists";
import { PencilIcon } from "@/components/ui/icons";

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
        className="heading-display group inline-flex items-center gap-2 text-3xl text-[var(--text-strong)] outline-none hover:opacity-80"
      >
        {currentName}
        <PencilIcon
          size={15}
          className="shrink-0 text-[var(--text-faint)] transition-colors group-hover:text-[var(--primary)]"
        />
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
          className="field-input flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn-primary shrink-0 px-3 py-2 text-sm"
        >
          {pending ? "保存中" : "保存"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="btn-secondary shrink-0 px-3 py-2 text-sm"
        >
          取消
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          {state.error}
        </p>
      )}
    </form>
  );
}
