"use client";

import { useActionState, useEffect, useState } from "react";
import {
  logVisit,
  updateVisit,
  type VisitFormState,
} from "@/lib/actions/visits";
import type { VisitLog, VisitSentiment } from "@/lib/db/types";

const SENTIMENT_OPTIONS: Array<{
  value: VisitSentiment;
  label: string;
  emoji: string;
}> = [
  { value: "will_return", label: "还想再来", emoji: "❤️" },
  { value: "okay", label: "一般般", emoji: "🟡" },
  { value: "wont_return", label: "不会再来", emoji: "👎" },
];

type Mode =
  | { kind: "create"; placeId: string }
  | { kind: "edit"; log: VisitLog };

type Props = {
  mode: Mode;
  open: boolean;
  onClose: () => void;
};

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayIsoDate();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function VisitLogForm({ mode, open, onClose }: Props) {
  const action = mode.kind === "create" ? logVisit : updateVisit;
  const [state, formAction, pending] = useActionState<VisitFormState, FormData>(
    action,
    { error: null },
  );

  const initialSentiment: VisitSentiment =
    mode.kind === "edit" ? mode.log.sentiment : "will_return";
  const [sentiment, setSentiment] = useState<VisitSentiment>(initialSentiment);

  const initialStar = mode.kind === "edit" ? mode.log.star_rating : null;
  const [star, setStar] = useState<number | null>(initialStar);

  // 成功后自动关
  useEffect(() => {
    if (state.ok && state.version) {
      onClose();
    }
    // 仅在 version 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.version]);

  if (!open) return null;

  const initialVisitedAt =
    mode.kind === "edit" ? isoToDateInput(mode.log.visited_at) : todayIsoDate();
  const initialNote = mode.kind === "edit" ? (mode.log.note ?? "") : "";
  const initialCompanions =
    mode.kind === "edit" ? (mode.log.companions ?? "") : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <form
        action={formAction}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 className="heading-display text-lg">
          {mode.kind === "create" ? "记一次造访" : "编辑造访记录"}
        </h3>

        {mode.kind === "create" ? (
          <input type="hidden" name="place_id" value={mode.placeId} />
        ) : (
          <input type="hidden" name="id" value={mode.log.id} />
        )}

        {/* sentiment */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            体验
          </label>
          <input type="hidden" name="sentiment" value={sentiment} />
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {SENTIMENT_OPTIONS.map((o) => {
              const active = sentiment === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSentiment(o.value)}
                  className={`rounded-xl border px-2 py-2 text-sm transition ${
                    active
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                      : "border-[var(--border-subtle)] bg-white text-[var(--text-default)] hover:border-[var(--primary)]/40"
                  }`}
                >
                  <div className="text-lg">{o.emoji}</div>
                  <div className="mt-0.5 text-xs">{o.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* star rating */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            星级（可选）
          </label>
          <input
            type="hidden"
            name="star_rating"
            value={star === null ? "" : String(star)}
          />
          <div className="mt-1.5 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStar(star === n ? null : n)}
                aria-label={`${n} 星`}
                className="text-2xl leading-none transition hover:scale-110"
              >
                {star !== null && n <= star ? (
                  <span className="text-amber-400">★</span>
                ) : (
                  <span className="text-zinc-300">☆</span>
                )}
              </button>
            ))}
            {star !== null && (
              <button
                type="button"
                onClick={() => setStar(null)}
                className="ml-2 text-xs text-zinc-500 hover:underline"
              >
                清除
              </button>
            )}
          </div>
        </div>

        {/* date */}
        <div>
          <label
            htmlFor="visited_at"
            className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
          >
            日期
          </label>
          <input
            id="visited_at"
            name="visited_at"
            type="date"
            defaultValue={initialVisitedAt}
            className="field-input mt-1.5 text-sm"
          />
        </div>

        {/* companions */}
        <div>
          <label
            htmlFor="companions"
            className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
          >
            和谁去
          </label>
          <input
            id="companions"
            name="companions"
            type="text"
            defaultValue={initialCompanions}
            maxLength={100}
            placeholder="女朋友 / 朋友 / 一个人..."
            className="field-input mt-1.5 text-sm"
          />
        </div>

        {/* note */}
        <div>
          <label
            htmlFor="note"
            className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
          >
            笔记（可选）
          </label>
          <textarea
            id="note"
            name="note"
            defaultValue={initialNote}
            maxLength={1000}
            rows={3}
            placeholder="点了什么？等位多久？环境怎么样？"
            className="field-input mt-1.5 resize-y text-sm"
          />
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn-secondary px-4 py-2 text-sm"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending}
            className="btn-primary px-4 py-2 text-sm"
          >
            {pending ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
