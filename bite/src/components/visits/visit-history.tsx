"use client";

import { useState } from "react";
import { useTransition, useRef } from "react";
import type { VisitLog } from "@/lib/db/types";
import {
  FlameIcon,
  PencilIcon,
  StarIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TrashIcon,
  UtensilsIcon,
} from "@/components/ui/icons";
import { VisitLogForm } from "./visit-log-form";
import { VisitLogButton } from "./visit-log-button";
import { deleteVisit } from "@/lib/actions/visits";

const SENTIMENT_META: Record<
  VisitLog["sentiment"],
  {
    label: string;
    Icon: typeof FlameIcon;
    /** 时间线圆点的配色 */
    dotCls: string;
    /** 行内文字标签配色 */
    textCls: string;
  }
> = {
  will_return: {
    label: "会再来",
    Icon: FlameIcon,
    dotCls: "bg-[var(--primary-soft)] text-[var(--primary-soft-text)]",
    textCls: "text-[var(--primary-soft-text)]",
  },
  okay: {
    label: "还行",
    Icon: ThumbsUpIcon,
    dotCls: "bg-[var(--sage-soft)] text-[var(--sage-text)]",
    textCls: "text-[var(--sage-text)]",
  },
  wont_return: {
    label: "不会再来",
    Icon: ThumbsDownIcon,
    dotCls: "bg-[var(--surface-muted)] text-[var(--text-muted)]",
    textCls: "text-[var(--text-muted)]",
  },
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
  canEdit = true,
  currentUserId,
  visitAuthors = {},
  photoDisplayMap,
}: {
  placeId: string;
  logs: VisitLog[];
  canEdit?: boolean;
  /** 当前用户的 id，用来判断每条记录是不是 ta 自己的 */
  currentUserId?: string;
  /** user_id → display name，用来显示别人的记录作者 */
  visitAuthors?: Record<string, string>;
  /** canonical → signed 预览映射，透传给编辑表单（photos bucket 私有化） */
  photoDisplayMap?: Record<string, string>;
}) {
  const [editingLog, setEditingLog] = useState<VisitLog | null>(null);

  return (
    <div>
      <div className="section-heading mb-4">
        <h2 className="text-lg">
          造访记录
          {logs.length > 0 && (
            <span className="ml-1.5 text-sm text-[var(--text-faint)]">
              · {logs.length}
            </span>
          )}
        </h2>
        {canEdit && <VisitLogButton placeId={placeId} variant="btn" />}
      </div>

      {logs.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-5 py-8 text-center">
          <UtensilsIcon size={22} className="text-[var(--text-faint)]" />
          <p className="text-sm text-[var(--text-muted)]">
            还没有造访记录。去过之后记一笔，AI 决策时会参考。
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* 时间线竖线 */}
          <div
            aria-hidden
            className="absolute bottom-5 left-4 top-5 w-px bg-[var(--border-default)]"
          />
          <ul className="space-y-4">
            {logs.map((log) => {
              const isOwn = currentUserId && log.user_id === currentUserId;
              const authorLabel = isOwn
                ? null
                : visitAuthors[log.user_id] ?? "朋友";
              const meta = SENTIMENT_META[log.sentiment];
              const SentimentIcon = meta.Icon;
              return (
                <li key={log.id} className="relative flex items-start gap-3">
                  {/* 时间线节点：sentiment 图标 */}
                  <span
                    className={`relative z-10 mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.dotCls}`}
                    title={meta.label}
                  >
                    <SentimentIcon size={15} />
                  </span>

                  <div className="card min-w-0 flex-1 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-sm font-medium text-[var(--text-strong)]">
                            {fmtDate(log.visited_at)}
                          </span>
                          <span className={`text-xs font-medium ${meta.textCls}`}>
                            {meta.label}
                          </span>
                          {log.star_rating !== null && (
                            <span className="inline-flex items-center gap-px">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <StarIcon
                                  key={n}
                                  size={11}
                                  filled={n <= (log.star_rating ?? 0)}
                                  className={
                                    n <= (log.star_rating ?? 0)
                                      ? "text-[var(--gold)]"
                                      : "text-[var(--border-strong)]"
                                  }
                                />
                              ))}
                            </span>
                          )}
                          {authorLabel && (
                            <span className="inline-flex items-center rounded-full bg-[var(--sage-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--sage-text)]">
                              @{authorLabel}
                            </span>
                          )}
                        </div>
                        {log.companions && (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            和 {log.companions}
                          </p>
                        )}
                        {log.note && (
                          <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--text-default)]">
                            {log.note}
                          </p>
                        )}
                      </div>
                      {/* 编辑/删除仅 own log + canEdit 时；不能改朋友的记录 */}
                      {canEdit && isOwn && (
                        <div className="flex shrink-0 gap-0.5">
                          <button
                            type="button"
                            onClick={() => setEditingLog(log)}
                            aria-label="编辑"
                            title="编辑"
                            className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
                          >
                            <PencilIcon size={13} />
                          </button>
                          <DeleteVisitButton logId={log.id} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editingLog && (
        <VisitLogForm
          mode={{ kind: "edit", log: editingLog }}
          open={true}
          onClose={() => setEditingLog(null)}
          photoDisplayMap={photoDisplayMap}
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
        aria-label="删除"
        title="删除"
        className="rounded-md p-1.5 text-[var(--danger-text)] transition-colors hover:bg-[var(--danger-bg)] disabled:opacity-50"
      >
        {pending ? "…" : <TrashIcon size={13} />}
      </button>
      <form ref={formRef} action={deleteVisit} className="hidden">
        <input type="hidden" name="id" value={logId} />
      </form>
    </>
  );
}
