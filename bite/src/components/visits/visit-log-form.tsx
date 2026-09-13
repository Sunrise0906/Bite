"use client";

import { useState, useTransition } from "react";
import { logVisit, updateVisit } from "@/lib/actions/visits";
import type { VisitLog, VisitSentiment } from "@/lib/db/types";
import { TIERS, type PlaceTier } from "@/lib/places/tier";
import { PhotoUpload } from "@/components/places/photo-upload";
import {
  FlameIcon,
  StarIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  XIcon,
} from "@/components/ui/icons";

const SENTIMENT_OPTIONS: Array<{
  value: VisitSentiment;
  label: string;
  Icon: typeof FlameIcon;
}> = [
  { value: "will_return", label: "会再来", Icon: FlameIcon },
  { value: "okay", label: "还行", Icon: ThumbsUpIcon },
  { value: "wont_return", label: "不会再来", Icon: ThumbsDownIcon },
];

/** 重访预填：设计文档 4.3 —— 再去同一家店时预填上次数据，用户只改有变化的部分 */
export type VisitPrefill = {
  sentiment?: VisitSentiment;
  star_rating?: number | null;
  companions?: string | null;
  /**
   * 我当前给这家店的档位（sql/0028）。
   * ⚠️ 这个**不是**「上次造访的」——档位是挂在整家店上的、每人一条。
   * 表单里必须预填成当前值，否则提交时会被当成「用户清空了」而删掉。
   */
  tier?: PlaceTier | null;
};

type Mode =
  | { kind: "create"; placeId: string; prefill?: VisitPrefill }
  | { kind: "edit"; log: VisitLog };

type Props = {
  mode: Mode;
  open: boolean;
  onClose: () => void;
  /** canonical → signed 预览映射（photos bucket 私有后 img 用它）。见 lib/storage/signed-photos */
  photoDisplayMap?: Record<string, string>;
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

export function VisitLogForm({ mode, open, onClose, photoDisplayMap }: Props) {
  const action = mode.kind === "create" ? logVisit : updateVisit;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initialSentiment: VisitSentiment =
    mode.kind === "edit"
      ? mode.log.sentiment
      : (mode.prefill?.sentiment ?? "will_return");
  const [sentiment, setSentiment] = useState<VisitSentiment>(initialSentiment);

  const initialStar =
    mode.kind === "edit"
      ? mode.log.star_rating
      : (mode.prefill?.star_rating ?? null);
  const [star, setStar] = useState<number | null>(initialStar);

  // 档位（sql/0028）。undefined = 调用方没告诉我们当前值 → **整个字段不渲染**，
  // 于是提交时 formData 里没有 tier，server action 也就不会去动 place_ratings。
  // 少了这一层，编辑一条老造访记录会把用户当前的档位静默删掉。
  const knownTier = mode.kind === "create" ? mode.prefill?.tier : undefined;
  const tierKnown = knownTier !== undefined;
  const [tier, setTier] = useState<PlaceTier | null>(knownTier ?? null);

  // photoUrls 存 canonical（hidden input 落库用）；img 预览查 displayMap 换 signed
  const initialPhotos = mode.kind === "edit" ? (mode.log.photos ?? []) : [];
  const [photoUrls, setPhotoUrls] = useState<string[]>(initialPhotos);
  const [uploadedMap, setUploadedMap] = useState<Record<string, string>>({});
  const displayMap = { ...(photoDisplayMap ?? {}), ...uploadedMap };

  if (!open) return null;

  function handleSubmit(fd: FormData) {
    startTransition(async () => {
      const result = await action({ error: null }, fd);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        onClose();
      }
    });
  }

  const initialVisitedAt =
    mode.kind === "edit" ? isoToDateInput(mode.log.visited_at) : todayIsoDate();
  const initialNote = mode.kind === "edit" ? (mode.log.note ?? "") : "";
  const initialCompanions =
    mode.kind === "edit"
      ? (mode.log.companions ?? "")
      : (mode.prefill?.companions ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <form
        action={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-card-hover)]"
      >
        <h3 className="heading-display text-xl">
          {mode.kind === "create" ? "记一次造访" : "编辑造访记录"}
        </h3>

        {mode.kind === "create" ? (
          <input type="hidden" name="place_id" value={mode.placeId} />
        ) : (
          <input type="hidden" name="id" value={mode.log.id} />
        )}

        {/* sentiment */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            体验
          </label>
          <input type="hidden" name="sentiment" value={sentiment} />
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {SENTIMENT_OPTIONS.map((o) => {
              const active = sentiment === o.value;
              const OptionIcon = o.Icon;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSentiment(o.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-sm transition ${
                    active
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:border-[var(--primary)]/40 hover:text-[var(--text-default)]"
                  }`}
                >
                  <OptionIcon size={18} filled={active} />
                  <span className="text-xs font-medium">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 档位：对整家店，不只这一次。见 sql/0028 的「为什么另起一张表」 */}
        {tierKnown && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              这家几档（可选）
            </label>
            <input
              type="hidden"
              name="tier"
              value={tier === null ? "" : String(tier)}
            />
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {TIERS.map((t) => {
                const active = tier === t.tier;
                return (
                  <button
                    key={t.tier}
                    type="button"
                    title={t.blurb}
                    onClick={() => setTier(active ? null : t.tier)}
                    className={`rounded-xl border px-1 py-2 text-xs font-semibold transition ${
                      active
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:border-[var(--primary)]/40 hover:text-[var(--text-default)]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-faint)]">
              评的是这家店本身（换你以后再看还是这一档）；上面的「体验」记的是这一次。
            </p>
          </div>
        )}

        {/* star rating */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
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
                className="leading-none transition hover:scale-110"
              >
                <StarIcon
                  size={24}
                  filled={star !== null && n <= star}
                  className={
                    star !== null && n <= star
                      ? "text-[var(--gold)]"
                      : "text-[var(--border-strong)]"
                  }
                />
              </button>
            ))}
            {star !== null && (
              <button
                type="button"
                onClick={() => setStar(null)}
                className="ml-2 text-xs text-[var(--text-muted)] hover:underline"
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
            className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
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
            className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
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
            className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
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

        {/* photos */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            图片（可选）
          </label>
          {/* 提交时由父表单一并带上：每行一个 URL，与 places 的 photo_urls_text 对齐 */}
          <input
            type="hidden"
            name="photos_text"
            value={photoUrls.join("\n")}
          />
          {photoUrls.length > 0 && (
            <ul className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {photoUrls.map((url, i) => (
                <li
                  key={`${url}-${i}`}
                  className="relative aspect-square overflow-hidden rounded-md border border-[var(--border-subtle)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayMap[url] ?? url}
                    alt={`图 ${i + 1}`}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    aria-label="移除"
                    onClick={() =>
                      setPhotoUrls((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="absolute right-1 top-1 inline-flex items-center justify-center rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <XIcon size={10} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <PhotoUpload
            className="mt-2"
            currentCount={photoUrls.length}
            onUploaded={(url, displayUrl) => {
              setPhotoUrls((prev) => [...prev, url]);
              if (displayUrl !== url) {
                setUploadedMap((prev) => ({ ...prev, [url]: displayUrl }));
              }
            }}
          />
        </div>

        {error && (
          <p role="alert" className="alert-error">
            {error}
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
