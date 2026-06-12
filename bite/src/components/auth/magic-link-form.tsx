"use client";

import { useActionState } from "react";
import { sendMagicLink } from "@/lib/actions/auth";
import { SendIcon } from "@/components/ui/icons";

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
        className="btn-secondary w-full gap-2 py-3 text-base"
      >
        {pending ? (
          "发送中…"
        ) : (
          <>
            <SendIcon size={16} className="text-[var(--text-muted)]" />
            发送登录链接到邮箱
          </>
        )}
      </button>
    </form>
  );
}
