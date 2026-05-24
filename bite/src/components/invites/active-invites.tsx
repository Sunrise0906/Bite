"use client";

import { useState, useTransition } from "react";
import { revokeListInvite } from "@/lib/actions/invites";

export type ActiveInvite = {
  token: string;
  role: "co_owner" | "viewer";
  expires_at: string;
};

export function ActiveInvitesPanel({ invites }: { invites: ActiveInvite[] }) {
  const [items, setItems] = useState(invites);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function copyUrl(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1500);
    });
  }

  function revoke(token: string) {
    if (!window.confirm("撤销这条邀请链接？链接立刻失效。")) return;
    setPendingToken(token);
    startTransition(async () => {
      const r = await revokeListInvite(token);
      setPendingToken(null);
      if ("ok" in r) {
        setItems((prev) => prev.filter((i) => i.token !== token));
      }
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        活跃邀请链接 · {items.length}
      </h3>
      <ul className="space-y-2">
        {items.map((inv) => {
          const expires = new Date(inv.expires_at);
          const isExpired = expires < new Date();
          return (
            <li
              key={inv.token}
              className="card flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
            >
              <span className="chip chip-neutral">
                {inv.role === "co_owner" ? "共同所有者" : "查看者"}
              </span>
              <span className="text-zinc-500">
                到期：{expires.toLocaleString("zh-CN")}
              </span>
              {isExpired && (
                <span className="chip chip-archived">已过期</span>
              )}
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => copyUrl(inv.token)}
                  className="rounded-md px-2 py-1 text-zinc-700 hover:bg-[var(--surface-muted)]"
                >
                  {copiedToken === inv.token ? "已复制" : "复制链接"}
                </button>
                <button
                  type="button"
                  onClick={() => revoke(inv.token)}
                  disabled={pendingToken === inv.token}
                  className="rounded-md px-2 py-1 text-red-700 hover:bg-[var(--surface-muted)] disabled:opacity-50"
                >
                  {pendingToken === inv.token ? "..." : "撤销"}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
