"use client";

import { useState, useTransition } from "react";
import { logVisit, updateVisit } from "@/lib/actions/visits";
import type { VisitLog, VisitSentiment } from "@/lib/db/types";
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

type Mode =
  | { kind: "create"; placeId: string }
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
    mode.kind === "edit" ? mode.log.sentiment : "will_return";
  const [sentiment, setSentiment] = useState<VisitSentiment>(initialSentiment);

  const initialStar = mode.kind === "edit" ? mode.log.star_rating : null;
  const [star, setStar] = useState<number | null>(initialStar);

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
    mode.kind === "edit" ? (mode.log.companions ?? "") : "";

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
