"use client";

import { useActionState } from "react";
import { signInWithEmail } from "@/lib/actions/auth";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInWithEmail, {
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
        className="field-input"
      />
      <input
        type="password"
        name="password"
        placeholder="密码"
        required
        autoComplete="current-password"
        minLength={6}
        className="field-input"
      />
      <input type="hidden" name="next" value={next ?? ""} />
      {state.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full py-3 text-base"
      >
        {pending ? "登录中…" : "登录"}
      </button>
      <p className="text-center text-xs text-zinc-500">
        忘了密码？下面的「魔法链接登录」也能进，不用密码
      </p>
    </form>
  );
}
