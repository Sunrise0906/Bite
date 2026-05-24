"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptListInvite } from "@/lib/actions/invites";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptListInvite(token);
      if ("error" in result) {
        setError(result.error);
      } else {
        router.push(`/lists/${result.list_id}?toast=invite_accepted`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="btn-primary w-full py-2.5 text-sm"
      >
        {pending ? "加入中..." : "加入这个 list"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
