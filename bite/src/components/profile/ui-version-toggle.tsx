"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUiVersion } from "@/lib/actions/ui-version";
import type { UiVersion } from "@/lib/ui-version";

const OPTS: Array<{ v: UiVersion; label: string; sub: string }> = [
  { v: "v1", label: "V1 经典", sub: "当前稳定版" },
  { v: "v2", label: "V2 新版", sub: "决策优先 · 试用中" },
];

export function UiVersionToggle({ current }: { current: UiVersion }) {
  const router = useRouter();
  const [v, setV] = useState<UiVersion>(current);
  const [pending, start] = useTransition();

  function pick(next: UiVersion) {
    if (next === v || pending) return;
    setV(next);
    start(async () => {
      await setUiVersion(next);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {OPTS.map((o) => {
        const on = v === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => pick(o.v)}
            disabled={pending}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              on
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-default)] hover:border-[var(--border-strong)]"
            }`}
          >
            <div className="text-sm font-semibold">{o.label}</div>
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">{o.sub}</div>
          </button>
        );
      })}
    </div>
  );
}
