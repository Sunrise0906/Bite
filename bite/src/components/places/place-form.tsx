"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createPlace, updatePlace } from "@/lib/actions/places";
import type { Place } from "@/lib/db/types";

const INPUT_CLS =
  "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

const LABEL_CLS = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const HELP_CLS = "mt-1 text-xs text-zinc-500";

type Mode =
  | { mode: "create"; listId: string; place?: undefined; currentUserId: string }
  | { mode: "edit"; listId: string; place: Place; currentUserId: string };

export function PlaceForm(props: Mode) {
  const action = props.mode === "create" ? createPlace : updatePlace;
  const [state, formAction, pending] = useActionState(action, { error: null });

  const place = props.place;
  const ownReason =
    place?.reasons.find((r) => r.user_id === props.currentUserId)?.text ?? "";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="list_id" value={props.listId} />
      {place && <input type="hidden" name="place_id" value={place.id} />}

      <div>
        <label htmlFor="p-name" className={LABEL_CLS}>
          店名 <span className="text-red-500">*</span>
        </label>
        <input
          id="p-name"
          type="text"
          name="name"
          required
          maxLength={120}
          defaultValue={place?.name ?? ""}
          className={`${INPUT_CLS} mt-1`}
        />
      </div>

      <div>
        <label htmlFor="p-address" className={LABEL_CLS}>
          地址 <span className="text-red-500">*</span>
        </label>
        <input
          id="p-address"
          type="text"
          name="address"
          required
          defaultValue={place?.address ?? ""}
          className={`${INPUT_CLS} mt-1`}
        />
        <p className={HELP_CLS}>Phase 2 会接 Google Places 自动补全</p>
      </div>

      <div>
        <label htmlFor="p-cuisine" className={LABEL_CLS}>
          菜系 <span className="text-red-500">*</span>
        </label>
        <input
          id="p-cuisine"
          type="text"
          name="cuisine"
          required
          defaultValue={place?.cuisine.join(", ") ?? ""}
          placeholder="例如：川菜、火锅"
          className={`${INPUT_CLS} mt-1`}
        />
        <p className={HELP_CLS}>多个用逗号 / 空格分隔</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="p-status" className={LABEL_CLS}>
            状态
          </label>
          <select
            id="p-status"
            name="status"
            defaultValue={place?.status ?? "want_to_go"}
            className={`${INPUT_CLS} mt-1`}
          >
            <option value="want_to_go">想去</option>
            <option value="visited">已去过</option>
            <option value="archived">归档</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-price" className={LABEL_CLS}>
            价位
          </label>
          <select
            id="p-price"
            name="price_range"
            defaultValue={place?.price_range ?? ""}
            className={`${INPUT_CLS} mt-1`}
          >
            <option value="">未填</option>
            <option value="$">$ · 人均 &lt; $15</option>
            <option value="$$">$$ · $15–30</option>
            <option value="$$$">$$$ · $30–60</option>
            <option value="$$$$">$$$$ · &gt; $60</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="p-occasions" className={LABEL_CLS}>
          适合场合
        </label>
        <input
          id="p-occasions"
          type="text"
          name="occasions"
          defaultValue={place?.occasions.join(", ") ?? ""}
          placeholder="例如：约会、聚会、招待长辈"
          className={`${INPUT_CLS} mt-1`}
        />
        <p className={HELP_CLS}>多个用逗号分隔</p>
      </div>

      <div>
        <label htmlFor="p-tags" className={LABEL_CLS}>
          自定义标签
        </label>
        <input
          id="p-tags"
          type="text"
          name="tags"
          defaultValue={place?.tags.join(", ") ?? ""}
          placeholder="例如：排队长、有露台、可带宠物"
          className={`${INPUT_CLS} mt-1`}
        />
      </div>

      <div>
        <label htmlFor="p-recommended" className={LABEL_CLS}>
          推荐来源
        </label>
        <input
          id="p-recommended"
          type="text"
          name="recommended_by"
          defaultValue={place?.recommended_by ?? ""}
          placeholder="朋友、XHS 博主、自己…"
          className={`${INPUT_CLS} mt-1`}
        />
      </div>

      <div>
        <label htmlFor="p-reason" className={LABEL_CLS}>
          想去理由 / 备注
        </label>
        <textarea
          id="p-reason"
          name="reason"
          rows={3}
          defaultValue={ownReason}
          placeholder="为啥想去？以后 AI 推荐会引用这里"
          className={`${INPUT_CLS} mt-1 resize-y`}
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <Link
          href={`/lists/${props.listId}`}
          className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-center text-base font-medium dark:border-zinc-700"
        >
          取消
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending
            ? "保存中…"
            : props.mode === "create"
              ? "保存"
              : "更新"}
        </button>
      </div>
    </form>
  );
}
