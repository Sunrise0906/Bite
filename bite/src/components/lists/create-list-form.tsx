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
          className="field-input flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn-primary shrink-0 px-4 text-sm"
        >
          {pending ? "创建中…" : "新建"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
