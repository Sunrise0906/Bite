"use client";

import { useActionState, useState } from "react";
import {
  cancelQuickAdd,
  savePlacesBatch,
} from "@/lib/actions/quick-add";
import type { ExtractedPlace } from "@/lib/llm/extract-place";
import type { ListOption } from "./place-confirm-form";
import { PhotoCarousel } from "./photo-carousel";
import { BotIcon } from "@/components/ui/icons";

const PRICE_LABEL: Record<NonNullable<ExtractedPlace["price_range"]>, string> = {
  $: "$ · <$15",
  $$: "$$ · $15-30",
  $$$: "$$$ · $30-60",
  $$$$: "$$$$ · >$60",
};

const CONFIDENCE_BADGE: Record<NonNullable<ExtractedPlace["confidence"]>, string> = {
  high: "chip chip-visited",
  medium: "chip chip-want",
  low: "chip chip-archived",
};

const CONFIDENCE_BADGE_V2: Record<
  NonNullable<ExtractedPlace["confidence"]>,
  string
> = {
  high: "v2-pill v2-pill-visited",
  medium: "v2-pill v2-pill-want",
  low: "v2-pill v2-pill-mute",
};

const CONFIDENCE_LABEL: Record<NonNullable<ExtractedPlace["confidence"]>, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function MultiPlaceList({
  places,
  lists,
  defaultListId,
  sourceUrl,
  existingByList = {},
  photoUrls = [],
  v2 = false,
}: {
  places: ExtractedPlace[];
  lists: ListOption[];
  defaultListId: string;
  sourceUrl?: string;
  existingByList?: Record<string, string[]>;
  photoUrls?: string[];
  /** V2 皮：srcbar + v2 勾选卡 + v2 按钮。勾选/保存逻辑与 V1 完全一致 */
  v2?: boolean;
}) {
  const [state, action, pending] = useActionState(savePlacesBatch, {
    error: null,
  });
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(places.map((_, i) => i)),
  );
  const [listId, setListId] = useState(defaultListId);

  const existingNamesInList = new Set(existingByList[listId] ?? []);
  const dupSelectedCount = Array.from(selected).reduce((sum, i) => {
    const p = places[i];
    return p && existingNamesInList.has(p.name) ? sum + 1 : sum;
  }, 0);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const selectAll = () =>
    setSelected(new Set(places.map((_, i) => i)));
  const clearAll = () => setSelected(new Set());

  return (
    <form action={action} className="space-y-5">
      <div
        className={
          v2
            ? "v2-srcbar"
            : "flex items-start gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 px-3.5 py-2.5 text-sm text-[var(--text-default)]"
        }
      >
        <BotIcon
          size={15}
          className={v2 ? "shrink-0" : "mt-0.5 shrink-0 text-[var(--text-muted)]"}
        />
        <span className="min-w-0">
          AI 识别为<strong> 合集帖</strong>，共 <strong>{places.length}</strong> 家店。勾选要添加的：
          {sourceUrl && (
            <>
              {" · "}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--primary)]"
              >
                查看原帖
              </a>
            </>
          )}
        </span>
      </div>

      <div>
        <label
          htmlFor="qfm-list"
          className="block text-sm font-medium text-[var(--text-default)]"
        >
          统一添加到 list <span className="text-[var(--primary)]">*</span>
        </label>
        <select
          id="qfm-list"
          name="list_id"
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          required
          className="field-input mt-1.5"
        >
          {lists.map((l) => {
            const existCount = (existingByList[l.id] ?? []).length;
            return (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.isOwner ? "" : "（共享）"}
                {existCount > 0 ? `  · ${existCount} 家已存在` : ""}
              </option>
            );
          })}
        </select>
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>
          已勾选 <strong className="text-[var(--text-strong)]">{selected.size}</strong> /{" "}
          {places.length}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={selectAll}
            className="font-medium underline-offset-2 transition-colors hover:text-[var(--text-strong)] hover:underline"
          >
            全选
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="font-medium underline-offset-2 transition-colors hover:text-[var(--text-strong)] hover:underline"
          >
            全不选
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {places.map((p, i) => {
          const checked = selected.has(i);
          const existsInThisList = existingNamesInList.has(p.name);
          // 只在 AI 给了 photo_indices 时显示预览，让用户验证分图结果。
          // 没标注的店保存时后端会回退到全部图，但这里不展示，避免每家店看起来都"重复占了同一组图"。
          const placePhotos =
            p.photo_indices && p.photo_indices.length > 0
              ? p.photo_indices
                  .filter((idx) => idx >= 0 && idx < photoUrls.length)
                  .map((idx) => photoUrls[idx])
              : [];
          return (
            <li key={i}>
              <label
                className={
                  v2
                    ? `v2-ccard${checked ? " on" : ""}`
                    : `card flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors ${
                        checked
                          ? "border-[var(--primary)] bg-[var(--primary-soft)]/20"
                          : ""
                      }`
                }
              >
                <input
                  type="checkbox"
                  name="selected"
                  value={i}
                  checked={checked}
                  onChange={() => toggle(i)}
                  className="mt-1 h-4 w-4 accent-[var(--primary)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-base font-medium text-[var(--text-strong)]">
                      {p.name}
                      {existsInThisList && (
                        <span className="ml-2 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 align-middle text-[10px] font-medium text-[var(--primary-soft-text)]">
                          已存在 · 将更新
                        </span>
                      )}
                    </span>
                    <span
                      className={
                        v2
                          ? CONFIDENCE_BADGE_V2[p.confidence]
                          : CONFIDENCE_BADGE[p.confidence]
                      }
                    >
                      信心 {CONFIDENCE_LABEL[p.confidence]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--text-muted)]">{p.address}</p>
                  {p.cuisine.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.cuisine.slice(0, 5).map((c) => (
                        <span key={c} className={v2 ? "v2-tag n" : "tag tag-neutral"}>
                          {c}
                        </span>
                      ))}
                      {p.price_range && (
                        <span className={v2 ? "v2-tag n" : "tag tag-neutral"}>
                          {PRICE_LABEL[p.price_range]}
                        </span>
                      )}
                    </div>
                  )}
                  {p.reason && (
                    <p className="mt-2 line-clamp-2 text-sm text-[var(--text-default)]">
                      <span className="text-[var(--primary)]">“</span>
                      {p.reason}
                      <span className="text-[var(--primary)]">”</span>
                    </p>
                  )}
                  {p.notes && (
                    <p
                      className={
                        v2
                          ? "v2-ainote-sm mt-2"
                          : "mt-2 flex items-start gap-1.5 rounded-lg bg-[var(--surface-muted)]/60 px-2.5 py-1.5 text-xs italic text-[var(--text-muted)]"
                      }
                    >
                      <BotIcon size={13} className="mt-px shrink-0" />
                      <span className="line-clamp-3">{p.notes}</span>
                    </p>
                  )}
                  {placePhotos.length > 0 && (
                    <div
                      className="mt-2 max-w-xs"
                      onClick={(e) => {
                        // 防止点轮播翻页时误触 label 的 checkbox toggle
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <p className="mb-1.5 flex items-center gap-1 text-[11px] text-[var(--text-faint)]">
                        <BotIcon size={12} className="shrink-0" />
                        AI 分图：{placePhotos.length} 张 · idx [
                        {p.photo_indices?.join(", ")}]
                      </p>
                      <PhotoCarousel urls={placePhotos} />
                    </div>
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {state.error && (
        <p role="alert" className="alert-error">
          {state.error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          formAction={cancelQuickAdd}
          className={
            v2
              ? "v2-btn ghost flex-1 py-3 text-base"
              : "btn-secondary flex-1 py-3 text-base"
          }
        >
          取消
        </button>
        <button
          type="submit"
          disabled={pending || selected.size === 0}
          className={
            v2
              ? "v2-btn flex-1 py-3 text-base"
              : "btn-primary flex-1 py-3 text-base"
          }
        >
          {pending
            ? "保存中…"
            : selected.size === 0
              ? "未选择"
              : dupSelectedCount > 0
                ? `保存 ${selected.size} 家（${dupSelectedCount} 家覆盖更新）`
                : `保存选中的 ${selected.size} 家`}
        </button>
      </div>

      <p className="text-center text-xs text-[var(--text-faint)]">
        保存后可在 list 详情页点单个店进编辑页细调字段
      </p>
    </form>
  );
}
