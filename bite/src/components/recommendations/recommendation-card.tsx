"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptRecommendation,
  declineRecommendation,
  withdrawRecommendation,
  type SnapshottedPlace,
} from "@/lib/actions/recommendations";
import { BotIcon } from "@/components/ui/icons";

type RecInput = {
  id: string;
  place: SnapshottedPlace;
  fromLabel: string;
  createdAt: string;
  status: "pending" | "accepted" | "declined";
  direction: "incoming" | "outgoing";
};

type ListOption = { id: string; name: string };

const STATUS_LABEL: Record<
  RecInput["status"],
  { label: string; chip: string }
> = {
  pending: { label: "待处理", chip: "chip chip-want" },
  accepted: { label: "已接受", chip: "chip chip-visited" },
  declined: { label: "已拒绝", chip: "chip chip-archived" },
};

function relTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const diff = Date.now() - d.getTime();
  const min = diff / 60_000;
  if (min < 1) return "刚刚";
  if (min < 60) return `${Math.floor(min)} 分钟前`;
  const hr = min / 60;
  if (hr < 24) return `${Math.floor(hr)} 小时前`;
  return d.toLocaleDateString("zh-CN");
}

export function RecommendationCard({
  rec,
  ownLists,
}: {
  rec: RecInput;
  ownLists: ListOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [targetListId, setTargetListId] = useState<string>(
    ownLists[0]?.id ?? "",
  );

  function accept() {
    if (!targetListId) {
      setError("先选一个 list");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await acceptRecommendation({
        id: rec.id,
        target_list_id: targetListId,
      });
      if ("error" in r) setError(r.error);
      else {
        const toast = r.merged ? "place_merged" : "place_added";
        router.push(`/lists/${r.list_id}?toast=${toast}`);
      }
    });
  }

  function decline() {
    if (!window.confirm("拒绝这条推荐？")) return;
    startTransition(async () => {
      const r = await declineRecommendation(rec.id);
      if ("error" in r) setError(r.error);
    });
  }

  function withdraw() {
    if (!window.confirm("撤回这条推荐？对方还没看到就消失了。")) return;
    startTransition(async () => {
      const r = await withdrawRecommendation(rec.id);
      if ("error" in r) setError(r.error);
    });
  }

  const status = STATUS_LABEL[rec.status];
  const isPendingIncoming =
    rec.status === "pending" && rec.direction === "incoming";
  const isPendingOutgoing =
    rec.status === "pending" && rec.direction === "outgoing";

  return (
    <article
      className={`card px-5 py-4 ${
        rec.status === "pending"
          ? "border-l-4 border-l-[var(--gold)]"
          : ""
      }`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--text-muted)]">
            {rec.direction === "incoming" ? "来自 " : "给 "}
            <span className="font-medium text-[var(--text-default)]">
              @{rec.fromLabel}
            </span>
            <span className="ml-2 text-[var(--text-faint)]">
              {relTime(rec.createdAt)}
            </span>
          </p>
          <h3 className="mt-1.5 text-base font-semibold text-[var(--text-strong)]">
            {rec.place.name}
          </h3>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {rec.place.address}
          </p>
        </div>
        <span className={status.chip}>{status.label}</span>
      </header>

      {rec.place.cuisine.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {rec.place.cuisine.map((c) => (
            <span key={c} className="tag tag-neutral">
              {c}
            </span>
          ))}
          {rec.place.price_range && (
            <span className="tag tag-neutral">{rec.place.price_range}</span>
          )}
        </div>
      )}

      {rec.place.message && (
        <p className="mt-3 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm italic text-[var(--text-default)]">
          <span className="text-[var(--primary)]">「</span>
          {rec.place.message}
          <span className="text-[var(--primary)]">」</span>
        </p>
      )}

      {rec.place.notes && (
        <p className="mt-2.5 flex items-start gap-1.5 text-xs text-[var(--text-muted)]">
          <BotIcon size={13} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{rec.place.notes}</span>
        </p>
      )}

      {error && (
        <p role="alert" className="alert-error mt-3">
          {error}
        </p>
      )}

      {isPendingIncoming && (
        <div className="mt-4">
          {!picking ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={pending || ownLists.length === 0}
                className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {ownLists.length === 0 ? "你还没 list" : "接受 + 加入..."}
              </button>
              <button
                type="button"
                onClick={decline}
                disabled={pending}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                拒绝
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                加到哪个 list
              </label>
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="field-input mt-1.5 text-sm"
              >
                {ownLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={accept}
                  disabled={pending || !targetListId}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  {pending ? "加入中..." : "确认加入"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isPendingOutgoing && (
        <div className="mt-4">
          <button
            type="button"
            onClick={withdraw}
            disabled={pending}
            className="btn-secondary px-3 py-1.5 text-xs text-[var(--danger)]"
          >
            撤回
          </button>
        </div>
      )}
    </article>
  );
}
