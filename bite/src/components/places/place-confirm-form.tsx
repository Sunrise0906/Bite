"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  cancelQuickAdd,
  savePlaceFromDraft,
} from "@/lib/actions/quick-add";
import type { PlacePrice, PlaceStatus } from "@/lib/db/types";

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
}: {
  initial: InitialPlaceData;
  lists: ListOption[];
  defaultListId: string;
  source: "text" | "place";
  confidence?: "high" | "medium" | "low";
}) {
  const [state, action, pending] = useActionState(savePlaceFromDraft, {
    error: null,
  });

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

      {confidence && confidence !== "high" && (
        <div className="alert-error" role="alert">
          <strong>
            {confidence === "low" ? "信心较低" : "部分字段是推测"}
          </strong>
          {initial.notes && <> — {initial.notes}</>}
          ，请检查并修改。
        </div>
      )}

      {source === "place" && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 px-3 py-2.5 text-xs text-zinc-600">
          📍 来自 Google Places · 已自动填入店名 / 地址 / 菜系推断
        </div>
      )}
      {source === "text" && (
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
          defaultValue={defaultListId}
          required
          className="field-input mt-1.5"
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.isOwner ? "" : "（共享）"}
            </option>
          ))}
        </select>
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
          想去理由 / 备注
        </label>
        <textarea
          id="qf-reason"
          name="reason"
          rows={3}
          defaultValue={initial.reason ?? ""}
          placeholder="为啥想去？以后 AI 推荐会引用这里"
          className="field-input mt-1.5 resize-y"
        />
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
          {pending ? "保存中…" : "确认添加"}
        </button>
      </div>
    </form>
  );
}
