"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { vocabFor, type PlaceDomain } from "@/lib/places/domain";
import {
  cancelQuickAdd,
  savePlaceFromDraft,
} from "@/lib/actions/quick-add";
import { listsWithSameName } from "@/lib/actions/place-lookup";
import type { PlacePrice, PlaceStatus } from "@/lib/db/types";
import { PhotoCarousel } from "./photo-carousel";
import {
  AlertIcon,
  BookIcon,
  BotIcon,
  GlobeIcon,
  PlusIcon,
  RefreshIcon,
} from "@/components/ui/icons";

/** 图标库里没有锁形图标，按约定在本文件内联一个 lucide 风格 SVG */
function LockIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

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
  dishes?: string[];
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
  /** 清单领域（sql/0016）—— 决定「菜系/品类/类型」这类标签怎么显示 */
  category?: PlaceDomain;
};

const LABEL_CLS = "block text-sm font-medium text-[var(--text-default)]";
const HELP_CLS = "mt-1.5 text-xs text-[var(--text-muted)]";

/** 来源提示条（icon + 一句说明，分层收纳到小字），用预置的 .v2-srcbar 皮 */
function SourceBanner({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="v2-srcbar">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

const CONF_LABEL = { high: "高", medium: "中", low: "低" } as const;
const CONF_BARS = { high: 3, medium: 2, low: 1 } as const;

/** V2 提取信心条（.v2-conf：文案 + 3 格进度条） */
function ConfidenceBarV2({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  const on = CONF_BARS[confidence];
  return (
    <div className="v2-conf">
      <div className="l">
        <span className="v2-muted">AI 提取信心</span>
        <b
          style={
            confidence === "high"
              ? undefined
              : { color: "var(--v2-primary-deep)" }
          }
        >
          {CONF_LABEL[confidence]}
          {confidence !== "high" && " · 请检查字段"}
        </b>
      </div>
      <div className="bars">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i < on ? "on" : undefined} />
        ))}
      </div>
    </div>
  );
}

/** V2 预览卡（.v2-preview：图集 + serif 店名 + meta + 招牌菜/标签 chips + AI 备注） */
function PreviewCardV2({
  initial,
  displayPhotos,
}: {
  initial: InitialPlaceData;
  displayPhotos?: string[];
}) {
  const photos = displayPhotos ?? initial.photo_urls ?? [];
  const meta = [
    initial.address,
    initial.cuisine.join(" · "),
    initial.price_range,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const chips = [
    ...(initial.dishes ?? []).map((d) => ({ text: d, primary: true })),
    ...(initial.tags ?? []).map((t) => ({ text: t, primary: false })),
    ...(initial.occasions ?? []).map((o) => ({ text: o, primary: false })),
  ].slice(0, 8);

  return (
    <div className="v2-preview">
      {photos.length > 0 ? (
        <div style={{ padding: "10px 10px 0" }}>
          <PhotoCarousel urls={photos} />
        </div>
      ) : (
        <div
          className="img"
          style={{
            height: 64,
            background:
              "linear-gradient(135deg,var(--v2-surface2),var(--v2-sunken))",
          }}
        />
      )}
      <div className="pb">
        <div className="nm">{initial.name}</div>
        {meta && <div className="mt">{meta}</div>}
        {chips.length > 0 && (
          <div className="chips">
            {chips.map((c, i) => (
              <span key={i} className={c.primary ? "v2-tag" : "v2-tag n"}>
                {c.primary ? `🍜 ${c.text}` : c.text}
              </span>
            ))}
          </div>
        )}
        {initial.notes && <div className="ai">🤖 {initial.notes}</div>}
      </div>
    </div>
  );
}

export function PlaceConfirmForm({
  initial,
  lists,
  defaultListId,
  source,
  confidence,
  existingInLists = [],
  photoDisplayUrls,
}: {
  initial: InitialPlaceData;
  lists: ListOption[];
  defaultListId: string;
  source: "text" | "place";
  confidence?: "high" | "medium" | "low";
  existingInLists?: string[];
  /** 预览专用 URL（私有桶图已签名）；hidden input / 落库仍走 initial.photo_urls（canonical） */
  photoDisplayUrls?: string[];
}) {
  const [state, action, pending] = useActionState(savePlaceFromDraft, {
    error: null,
  });
  const [selectedListId, setSelectedListId] = useState(defaultListId);

  // 店名受控 + 防抖重查：以前 name 是 uncontrolled，「已存在」只按初始名字算过一次，
  // 于是两个方向都会骗人 —— 最坏的是把名字改成库里那个之后，按钮还写「确认添加」，
  // 后端却直接覆盖了老记录。现在提示跟着你正在输入的名字走。
  const [name, setName] = useState(initial.name);
  const [fetched, setFetched] = useState<{
    name: string;
    lists: string[];
  } | null>(null);
  const listIdsKey = lists.map((l) => l.id).join(",");

  const trimmedName = name.trim();
  const isInitialName = trimmedName === initial.name.trim();
  // 派生而不是往 state 里塞：名字没改就用服务端算好的那份，改了就用查回来的那份，
  // 还没查回来是 null（= 检查中）。这样 effect 里不需要任何同步 setState。
  const dupLists = isInitialName
    ? existingInLists
    : fetched?.name === trimmedName
      ? fetched.lists
      : null;
  const checking = dupLists === null;

  useEffect(() => {
    if (isInitialName || fetched?.name === trimmedName) return;
    let alive = true;
    const t = setTimeout(() => {
      listsWithSameName(trimmedName, listIdsKey.split(","))
        .then((r) => alive && setFetched({ name: trimmedName, lists: r }))
        .catch(() => alive && setFetched({ name: trimmedName, lists: [] }));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [trimmedName, isInitialName, fetched?.name, listIdsKey]);

  const existingSet = new Set(dupLists ?? []);
  const isDuplicateInList = existingSet.has(selectedListId);
  // 标签跟着**当前选中的清单**走：把展览加进「玩」清单时，「菜系」应显示为「类型」
  const vocab = vocabFor(lists.find((l) => l.id === selectedListId)?.category);
  const currentListName =
    lists.find((l) => l.id === selectedListId)?.name ?? "";

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="source" value={initial.source} />
      {initial.dishes && initial.dishes.length > 0 && (
        <input
          type="hidden"
          name="dishes"
          value={initial.dishes.join(", ")}
        />
      )}
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
        <input
          type="hidden"
          name="photo_urls_text"
          value={initial.photo_urls.join("\n")}
        />
      )}
      <PreviewCardV2 initial={initial} displayPhotos={photoDisplayUrls} />
      {confidence && <ConfidenceBarV2 confidence={confidence} />}

      {source === "place" && (
        <SourceBanner icon={<GlobeIcon size={14} />}>
          来自 Google Places · 已自动填入店名 / 地址 / 类型推断
        </SourceBanner>
      )}
      {source === "text" && initial.source === "xhs" && (
        <SourceBanner icon={<BookIcon size={14} />}>
          来自小红书链接 · 已抓取并由 Claude 解析
          {initial.source_url && (
            <>
              {" · "}
              <a
                href={initial.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--primary)]"
              >
                查看原帖
              </a>
            </>
          )}
        </SourceBanner>
      )}
      {source === "text" && initial.source !== "xhs" && (
        <SourceBanner icon={<BotIcon size={14} />}>
          来自 Claude 解析 · 你可以修改任何字段
        </SourceBanner>
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
            className="mt-2 space-y-2 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)]/40 px-3.5 py-3 text-sm text-[var(--primary-soft-text)]"
          >
            <p className="flex items-start gap-1.5">
              <AlertIcon size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong>“{name.trim()}”</strong> 已在
                <strong>“{currentListName}”</strong> 里。提交会按以下规则合并：
              </span>
            </p>
            <ul className="space-y-1 pl-5 text-xs">
              <li className="flex items-start gap-1.5">
                <LockIcon size={12} className="mt-0.5 shrink-0" />
                <span>
                  <strong>想去理由</strong> ——你这次写的会替换你自己那条，
                  朋友写的原样保留；<strong>AI 备注</strong>{" "}
                  ——库里已有备注就保留它（你在本页对备注的编辑不会生效）
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <PlusIcon size={12} className="mt-0.5 shrink-0" />
                <span>
                  <strong>图片 / 菜系 / 标签 / 场合</strong>{" "}
                  ——合并去重（既有 + 新抓的）
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <RefreshIcon size={12} className="mt-0.5 shrink-0" />
                <span>
                  <strong>地址 / 价位 / 推荐来源</strong>{" "}
                  ——这次填了才覆盖，留空就保留原值；
                  <strong>状态</strong> ——标成「已去过 / 归档」会覆盖，
                  「想去」不会把已去过打回来
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>

      <section className="space-y-5 pt-1">
        <div className="v2-sec" style={{ margin: "0 0 2px" }}>
          <h3>基本信息</h3>
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
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          {vocab.typeLabel} <span className="text-[var(--primary)]">*</span>
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
      </section>

      <section className="space-y-5 pt-1">
        <div className="v2-sec" style={{ margin: "0 0 2px" }}>
          <h3>偏好与备注</h3>
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
      </section>

      {state.error && (
        <p role="alert" className="alert-error">
          {state.error}
        </p>
      )}

      {/* ⚠️ DOM 顺序刻意是「保存在前、取消在后」，视觉顺序靠 flex order 反过来。
          原因：在文本框里按 Enter 触发的是**表单里 tree order 上第一个 submit
          按钮**。取消带 formAction={cancelQuickAdd}（clearDraft + redirect，
          无确认无撤销），要是它排在前面，用户在店名框按个回车就把整份 AI 草稿
          连同手动修改一起清了。保存在前，Enter 就是保存 —— 符合直觉。
          （取消必须是 submit：formAction 在 type="button" 上会被忽略，那样按钮
          是死的。formNoValidate 则是绕开 required 字段校验，否则取消点不动。） */}
      <div className="flex gap-3 pt-2">
        {/* 查重没回来之前不许提交：否则按钮写着「确认添加」、后端却做了覆盖 */}
        <button
          type="submit"
          disabled={pending || checking}
          className="v2-btn order-2 flex-1 py-3 text-base"
        >
          {pending
            ? "保存中…"
            : checking
              ? "检查是否已存在…"
              : isDuplicateInList
                ? "覆盖更新"
                : "确认添加"}
        </button>
        <button
          type="submit"
          formAction={cancelQuickAdd}
          formNoValidate
          className="v2-btn ghost order-1 flex-1 py-3 text-base"
        >
          取消
        </button>
      </div>
    </form>
  );
}
