"use client";

import { useActionState } from "react";
import { INITIAL_STATE, signInWithEmail } from "@/lib/actions/auth";

const INPUT_CLS =
  "w-full rounded-lg border border-zinc-300 px-4 py-3 text-base outline-none transition-colors focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

const BUTTON_CLS =
  "w-full rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(
    signInWithEmail,
    INITIAL_STATE,
  );

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
      <input
        type="password"
        name="password"
        placeholder="密码"
        required
        autoComplete="current-password"
        minLength={6}
        className={INPUT_CLS}
      />
      <input type="hidden" name="next" value={next ?? ""} />
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={BUTTON_CLS}>
        {pending ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
