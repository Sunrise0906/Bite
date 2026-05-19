"use client";

import { useActionState, useRef } from "react";
import { createList } from "@/lib/actions/lists";

export function CreateListForm() {
  const [state, action, pending] = useActionState(createList, { error: null });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <input
          type="text"
          name="name"
          placeholder="新建 list，例如 “Irvine 想吃的”"
          required
          maxLength={80}
          className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "创建中…" : "新建"}
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
