"use client";

import { useActionState, useState } from "react";
import {
  cancelQuickAdd,
  savePlaceFromDraft,
} from "@/lib/actions/quick-add";
import type { PlacePrice, PlaceStatus } from "@/lib/db/types";
import { PhotoCarousel } from "./photo-carousel";

export type InitialPlaceData = {
  name: string;
  address: string;
  cuisine: string[];
  price_range?: PlacePrice;
  status?: PlaceStatus;
  occasions?: string[];
  recommended_by?: string;
  tags?: string[];
  reason?: string;
  source: "manual" | "xhs" | "ai_extract" | "google_places" | "yelp";
  source_url?: string;
  google_place_id?: string;
  lat?: number | null;
  lng?: number | null;
  notes?: string;
  photo_urls?: string[];
};

export type ListOption = {
  id: string;
  name: string;
  isOwner: boolean;
};

const LABEL_CLS = "block text-sm font-medium text-[var(--text-default)]";
const HELP_CLS = "mt-1.5 text-xs text-zinc-500";

export function PlaceConfirmForm({
  initial,
  lists,
  defaultListId,
  source,
  confidence,
  existingInLists = [],
}: {
  initial: InitialPlaceData;
  lists: ListOption[];
  defaultListId: string;
  source: "text" | "place";
  confidence?: "high" | "medium" | "low";
  existingInLists?: string[];
}) {
  const [state, action, pending] = useActionState(savePlaceFromDraft, {
    error: null,
  });
  const [selectedListId, setSelectedListId] = useState(defaultListId);
  const existingSet = new Set(existingInLists);
  const isDuplicateInList = existingSet.has(selectedListId);
  const currentListName =
    lists.find((l) => l.id === selectedListId)?.name ?? "";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="source" value={initial.source} />
      {initial.source_url && (
        <input type="hidden" name="source_url" value={initial.source_url} />
      )}
      {initial.google_place_id && (
        <input
          type="hidden"
          name="google_place_id"
          value={initial.google_place_id}
        />
      )}
      {initial.lat !== null && initial.lat !== undefined && (
        <input type="hidden" name="lat" value={String(initial.lat)} />
      )}
      {initial.lng !== null && initial.lng !== undefined && (
        <input type="hidden" name="lng" value={String(initial.lng)} />
      )}
      {initial.photo_urls && initial.photo_urls.length > 0 && (
        <>
          <input
            type="hidden"
            name="photo_urls_text"
            value={initial.photo_urls.join("\n")}
          />
          <PhotoCarousel urls={initial.photo_urls} />
        </>
      )}

      {confidence && confidence !== "high" && (
        <div className="alert-error" role="alert">
          <strong>
            {confidence === "low" ? "信心较低" : "部分字段是推测"}
          </strong>
          ，请检查并修改。
        </div>
      )}

      {source === "place" && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 px-3 py-2.5 text-xs text-zinc-600">
          📍 来自 Google Places · 已自动填入店名 / 地址 / 菜系推断
        </div>
      )}
      {source === "text" && initial.source === "xhs" && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 px-3 py-2.5 text-xs text-zinc-600">
          🔗 来自小红书链接 · 已抓取并由 Claude 解析
          {initial.source_url && (
            <>
              {" · "}
              <a
                href={initial.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-zinc-400 underline-offset-2 hover:text-[var(--primary)]"
              >
                查看原帖
              </a>
            </>
          )}
        </div>
      )}
      {source === "text" && initial.source !== "xhs" && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 px-3 py-2.5 text-xs text-zinc-600">
          ✨ 来自 Claude 解析 · 你可以修改任何字段
        </div>
      )}

      <div>
        <label htmlFor="qf-list" className={LABEL_CLS}>
          添加到 list <span className="text-[var(--primary)]">*</span>
        </label>
        <select
          id="qf-list"
          name="list_id"
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
          required
          className="field-input mt-1.5"
        >
          {lists.map((l) => {
            const exists = existingSet.has(l.id);
            return (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.isOwner ? "" : "（共享）"}
                {exists ? "  · 已存在同名店" : ""}
              </option>
            );
          })}
        </select>
        {isDuplicateInList && (
          <div
            role="status"
            className="mt-2 space-y-1.5 rounded-lg border border-[var(--primary-soft)] bg-[var(--primary-soft)]/40 px-3 py-2.5 text-sm text-[var(--primary-soft-text)]"
          >
            <p>
              ⚠️ <strong>“{initial.name}”</strong> 已在
              <strong>“{currentListName}”</strong> 里。提交会按以下规则合并：
            </p>
            <ul className="space-y-0.5 pl-5 text-xs">
              <li>
                🔒 <strong>想去理由</strong> 和 <strong>AI 备注</strong>{" "}
                ——保留你的修改（不被新 AI 输出覆盖）
              </li>
              <li>
                ➕ <strong>图片 / 菜系 / 标签 / 场合</strong>{" "}
                ——合并去重（既有 + 新抓的）
              </li>
              <li>
                ↻ <strong>地址 / 价位 / 状态 / 推荐来源</strong>{" "}
                ——用新的覆盖
              </li>
            </ul>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="qf-name" className={LABEL_CLS}>
          店名 <span className="text-[var(--primary)]">*</span>
        </label>
        <input
          id="qf-name"
          type="text"
          name="name"
          required
          maxLength={120}
          defaultValue={initial.name}
          className="field-input mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="qf-address" className={LABEL_CLS}>
          地址 <span className="text-[var(--primary)]">*</span>
        </label>
        <input
          id="qf-address"
          type="text"
          name="address"
          required
          defaultValue={initial.address}
          className="field-input mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="qf-cuisine" className={LABEL_CLS}>
          菜系 <span className="text-[var(--primary)]">*</span>
        </label>
        <input
          id="qf-cuisine"
          type="text"
          name="cuisine"
          required
          defaultValue={initial.cuisine.join(", ")}
          placeholder="川菜、火锅"
          className="field-input mt-1.5"
        />
        <p className={HELP_CLS}>多个用逗号 / 空格分隔</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="qf-status" className={LABEL_CLS}>
            状态
          </label>
          <select
            id="qf-status"
            name="status"
            defaultValue={initial.status ?? "want_to_go"}
            className="field-input mt-1.5"
          >
            <option value="want_to_go">想去</option>
            <option value="visited">已去过</option>
            <option value="archived">归档</option>
          </select>
        </div>
        <div>
          <label htmlFor="qf-price" className={LABEL_CLS}>
            价位
          </label>
          <select
            id="qf-price"
            name="price_range"
            defaultValue={initial.price_range ?? ""}
            className="field-input mt-1.5"
          >
            <option value="">未填</option>
            <option value="$">$ · &lt; $15</option>
            <option value="$$">$$ · $15-30</option>
            <option value="$$$">$$$ · $30-60</option>
            <option value="$$$$">$$$$ · &gt; $60</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="qf-occasions" className={LABEL_CLS}>
          适合场合
        </label>
        <input
          id="qf-occasions"
          type="text"
          name="occasions"
          defaultValue={initial.occasions?.join(", ") ?? ""}
          placeholder="约会、聚会、招待长辈"
          className="field-input mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="qf-tags" className={LABEL_CLS}>
          标签
        </label>
        <input
          id="qf-tags"
          type="text"
          name="tags"
          defaultValue={initial.tags?.join(", ") ?? ""}
          placeholder="排队长、有露台、可带宠物"
          className="field-input mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="qf-recommended" className={LABEL_CLS}>
          推荐来源
        </label>
        <input
          id="qf-recommended"
          type="text"
          name="recommended_by"
          defaultValue={initial.recommended_by ?? ""}
          placeholder="朋友、XHS 博主、自己…"
          className="field-input mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="qf-reason" className={LABEL_CLS}>
          想去理由
        </label>
        <textarea
          id="qf-reason"
          name="reason"
          rows={2}
          defaultValue={initial.reason ?? ""}
          placeholder="为啥想去？以后 AI 推荐会引用这里"
          className="field-input mt-1.5 resize-y"
        />
      </div>

      <div>
        <label htmlFor="qf-notes" className={LABEL_CLS}>
          AI 综合判断 / 备注
          {initial.notes && (
            <span className="ml-2 rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary-soft-text)]">
              AI 自动写
            </span>
          )}
        </label>
        <textarea
          id="qf-notes"
          name="notes"
          rows={3}
          defaultValue={initial.notes ?? ""}
          placeholder="客观信号：评论区分歧、排队、营业时间、性价比、缺失信息…"
          className="field-input mt-1.5 resize-y"
        />
        <p className={HELP_CLS}>
          会持久保存到这家店，未来决策 agent 会读它做推荐
        </p>
      </div>

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
          disabled={pending}
          className="btn-primary flex-1 py-3 text-base"
        >
          {pending
            ? "保存中…"
            : isDuplicateInList
              ? "覆盖更新"
              : "确认添加"}
        </button>
      </div>
    </form>
  );
}
