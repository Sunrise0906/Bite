"use client";

import { useActionState } from "react";
import { signUpWithEmail } from "@/lib/actions/auth";

const INPUT_CLS =
  "w-full rounded-lg border border-zinc-300 px-4 py-3 text-base outline-none transition-colors focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

const BUTTON_CLS =
  "w-full rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpWithEmail, {
    error: null,
    notice: null,
  });

  return (
    <form action={action} className="space-y-3">
      <input
        type="text"
        name="name"
        placeholder="昵称（选填）"
        autoComplete="name"
        className={INPUT_CLS}
      />
      <input
        type="email"
        name="email"
        placeholder="邮箱（QQ / 163 / Gmail 都可以）"
        required
        autoComplete="email"
        className={INPUT_CLS}
      />
      <input
        type="password"
        name="password"
        placeholder="密码（至少 6 位）"
        required
        minLength={6}
        autoComplete="new-password"
        className={INPUT_CLS}
      />
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
        {pending ? "注册中…" : "注册"}
      </button>
    </form>
  );
}
