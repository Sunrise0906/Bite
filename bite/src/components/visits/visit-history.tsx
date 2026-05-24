"use client";

import { useState } from "react";
import { useTransition, useRef } from "react";
import type { VisitLog } from "@/lib/db/types";
import { VisitLogForm } from "./visit-log-form";
import { VisitLogButton } from "./visit-log-button";
import { deleteVisit } from "@/lib/actions/visits";

const SENTIMENT_LABEL: Record<VisitLog["sentiment"], string> = {
  will_return: "❤️ 还想再来",
  okay: "🟡 一般般",
  wont_return: "👎 不会再来",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function VisitHistory({
  placeId,
  logs,
}: {
  placeId: string;
  logs: VisitLog[];
}) {
  const [editingLog, setEditingLog] = useState<VisitLog | null>(null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          造访记录 {logs.length > 0 && `· ${logs.length}`}
        </h2>
        <VisitLogButton placeId={placeId} variant="btn" />
      </div>

      {logs.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-zinc-500">
          还没有造访记录。去过之后记一笔，AI 决策时会参考。
        </p>
      ) : (
        <ul className="space-y-2.5">
          {logs.map((log) => (
            <li key={log.id} className="card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="text-sm font-medium text-[var(--text-strong)]">
                      {fmtDate(log.visited_at)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {SENTIMENT_LABEL[log.sentiment]}
                    </span>
                    {log.star_rating !== null && (
                      <span className="text-xs text-amber-500">
                        {"★".repeat(log.star_rating)}
                        <span className="text-zinc-300">
                          {"★".repeat(5 - log.star_rating)}
                        </span>
                      </span>
                    )}
                  </div>
                  {log.companions && (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      和 {log.companions}
                    </p>
                  )}
                  {log.note && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-700">
                      {log.note}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingLog(log)}
                    className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
                  >
                    ✎
                  </button>
                  <DeleteVisitButton logId={log.id} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingLog && (
        <VisitLogForm
          mode={{ kind: "edit", log: editingLog }}
          open={true}
          onClose={() => setEditingLog(null)}
        />
      )}
    </div>
  );
}

function DeleteVisitButton({ logId }: { logId: string }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("删除这条造访记录？无法撤销。")) return;
          startTransition(() => {
            formRef.current?.requestSubmit();
          });
        }}
        className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-[var(--surface-muted)] disabled:opacity-50"
      >
        {pending ? "..." : "🗑"}
      </button>
      <form ref={formRef} action={deleteVisit} className="hidden">
        <input type="hidden" name="id" value={logId} />
      </form>
    </>
  );
}
