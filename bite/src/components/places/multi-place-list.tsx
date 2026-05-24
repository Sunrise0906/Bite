"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  cancelQuickAdd,
  savePlacesBatch,
} from "@/lib/actions/quick-add";
import type { ExtractedPlace } from "@/lib/llm/extract-place";
import type { ListOption } from "./place-confirm-form";

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
}: {
  places: ExtractedPlace[];
  lists: ListOption[];
  defaultListId: string;
  sourceUrl?: string;
  existingByList?: Record<string, string[]>;
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
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 px-3 py-2.5 text-sm text-zinc-700">
        🤖 AI 识别为<strong> 合集帖</strong>，共 <strong>{places.length}</strong> 家店。勾选要添加的：
        {sourceUrl && (
          <>
            {" · "}
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-zinc-400 underline-offset-2 hover:text-[var(--primary)]"
            >
              查看原帖
            </a>
          </>
        )}
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

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          已勾选 <strong className="text-[var(--text-strong)]">{selected.size}</strong> /{" "}
          {places.length}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={selectAll}
            className="underline-offset-2 hover:underline"
          >
            全选
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="underline-offset-2 hover:underline"
          >
            全不选
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {places.map((p, i) => {
          const checked = selected.has(i);
          const existsInThisList = existingNamesInList.has(p.name);
          return (
            <li key={i}>
              <label
                className={`card flex cursor-pointer items-start gap-3 p-4 transition-colors ${
                  checked
                    ? "border-[var(--primary)] bg-[var(--primary-soft)]/20"
                    : ""
                }`}
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
                    <span className={CONFIDENCE_BADGE[p.confidence]}>
                      信心 {CONFIDENCE_LABEL[p.confidence]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-500">{p.address}</p>
                  {p.cuisine.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.cuisine.slice(0, 5).map((c) => (
                        <span key={c} className="chip chip-neutral">
                          {c}
                        </span>
                      ))}
                      {p.price_range && (
                        <span className="chip chip-neutral">
                          {PRICE_LABEL[p.price_range]}
                        </span>
                      )}
                    </div>
                  )}
                  {p.reason && (
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                      <span className="text-[var(--primary)]">“</span>
                      {p.reason}
                      <span className="text-[var(--primary)]">”</span>
                    </p>
                  )}
                  {p.notes && (
                    <p className="mt-1.5 line-clamp-3 rounded-md bg-[var(--surface-muted)]/60 px-2 py-1.5 text-xs italic text-zinc-500">
                      🤖 {p.notes}
                    </p>
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
          className="btn-secondary flex-1 py-3 text-base"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={pending || selected.size === 0}
          className="btn-primary flex-1 py-3 text-base"
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

      <p className="text-center text-xs text-zinc-500">
        保存后可在 list 详情页点单个店进编辑页细调字段
      </p>
    </form>
  );
}
