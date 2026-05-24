"use client";

import { useActionState, useState } from "react";
import { processTextDraft } from "@/lib/actions/quick-add";

export function RetryExtract({ initial }: { initial: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(processTextDraft, {
    error: null,
  });
  const [text, setText] = useState(initial);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-zinc-500 underline-offset-2 hover:text-[var(--text-strong)] hover:underline"
      >
        🔁 AI 解析得不对？改一下原始输入重新解析
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <label
        htmlFor="retry-text"
        className="block text-sm font-medium text-[var(--text-default)]"
      >
        原始输入（编辑后重新解析）
      </label>
      <textarea
        id="retry-text"
        name="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="field-input resize-y"
        maxLength={10000}
      />
      {state.error && (
        <p role="alert" className="alert-error">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-secondary px-3 py-1.5 text-sm"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary px-3 py-1.5 text-sm"
        >
          {pending ? "解析中…" : "重新解析"}
        </button>
      </div>
    </form>
  );
}
