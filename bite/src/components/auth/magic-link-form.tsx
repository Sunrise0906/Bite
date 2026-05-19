"use client";

import { useActionState } from "react";
import { sendMagicLink } from "@/lib/actions/auth";

const INPUT_CLS =
  "w-full rounded-lg border border-zinc-300 px-4 py-3 text-base outline-none transition-colors focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

const BUTTON_CLS =
  "w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-medium text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function MagicLinkForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, {
    error: null,
    notice: null,
  });

  return (
    <form action={action} className="space-y-3">
      <input
        type="email"
        name="email"
        placeholder="邮箱"
        required
        autoComplete="email"
        className={INPUT_CLS}
      />
      <input type="hidden" name="next" value={next ?? ""} />
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          {state.notice}
        </p>
      )}
      <button type="submit" disabled={pending} className={BUTTON_CLS}>
        {pending ? "发送中…" : "📩 发送登录链接到邮箱"}
      </button>
    </form>
  );
}
