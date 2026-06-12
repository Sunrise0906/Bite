"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveList } from "@/lib/actions/list-members";

export function LeaveListButton({
  listId,
  listName,
}: {
  listId: string;
  listName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`离开「${listName}」？你将无法再访问。`)) return;
        startTransition(async () => {
          const r = await leaveList(listId);
          if ("ok" in r) {
            router.push("/lists");
          }
        });
      }}
      className="btn-secondary px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-50"
    >
      {pending ? "..." : "离开 list"}
    </button>
  );
}
