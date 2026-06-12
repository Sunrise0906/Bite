"use client";

import { useState, useTransition } from "react";
import {
  changeMemberRole,
  removeMember,
} from "@/lib/actions/list-members";
import { UsersIcon } from "@/components/ui/icons";

export type MemberDisplay = {
  user_id: string;
  role: "co_owner" | "viewer";
  display_name: string;
};

export function MembersPanel({
  listId,
  members,
}: {
  listId: string;
  members: MemberDisplay[];
}) {
  const [items, setItems] = useState(members);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleRole(uid: string, current: "co_owner" | "viewer") {
    const next: "co_owner" | "viewer" =
      current === "co_owner" ? "viewer" : "co_owner";
    setPendingUid(uid);
    startTransition(async () => {
      const r = await changeMemberRole(listId, uid, next);
      setPendingUid(null);
      if ("ok" in r) {
        setItems((prev) =>
          prev.map((m) => (m.user_id === uid ? { ...m, role: next } : m)),
        );
      }
    });
  }

  function remove(uid: string, name: string) {
    if (!window.confirm(`把 @${name} 移出这个 list？`)) return;
    setPendingUid(uid);
    startTransition(async () => {
      const r = await removeMember(listId, uid);
      setPendingUid(null);
      if ("ok" in r) {
        setItems((prev) => prev.filter((m) => m.user_id !== uid));
      }
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="mb-8">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        <UsersIcon size={13} className="text-[var(--text-faint)]" />
        成员 · {items.length}
      </h3>
      <ul className="space-y-2">
        {items.map((m) => (
          <li
            key={m.user_id}
            className="card flex flex-wrap items-center gap-2 px-5 py-3 text-xs"
          >
            <span className="inline-flex items-center rounded-full bg-[var(--sage-soft)] px-2.5 py-1 font-semibold text-[var(--sage-text)]">
              @{m.display_name}
            </span>
            <button
              type="button"
              onClick={() => toggleRole(m.user_id, m.role)}
              disabled={pendingUid === m.user_id}
              className="chip chip-neutral cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50"
              title="点击切换角色"
            >
              {m.role === "co_owner" ? "共同所有者" : "查看者"}
            </button>
            <button
              type="button"
              onClick={() => remove(m.user_id, m.display_name)}
              disabled={pendingUid === m.user_id}
              className="ml-auto rounded-lg px-2 py-1 text-[var(--danger)] transition-colors hover:bg-[var(--danger-bg)] disabled:opacity-50"
            >
              {pendingUid === m.user_id ? "..." : "移除"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
