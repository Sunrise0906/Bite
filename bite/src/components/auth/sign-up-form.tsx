"use client";

import { useActionState } from "react";
import { signUpWithEmail } from "@/lib/actions/auth";

export function SignUpForm({ next }: { next?: string }) {
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
        className="field-input"
      />
      <input
        type="email"
        name="email"
        placeholder="邮箱（QQ / 163 / Gmail 都可以）"
        required
        autoComplete="email"
        className="field-input"
      />
      <input
        type="password"
        name="password"
        placeholder="密码（至少 6 位）"
        required
        minLength={6}
        autoComplete="new-password"
        className="field-input"
      />
      <input type="hidden" name="next" value={next ?? ""} />
      {state.error && (
        <p role="alert" className="alert-error">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="alert-success">
          {state.notice}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full py-3 text-base"
      >
        {pending ? "创建中…" : "创建账号"}
      </button>
    </form>
  );
}
