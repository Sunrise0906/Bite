"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createPlace, updatePlace } from "@/lib/actions/places";
import type { Place } from "@/lib/db/types";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ImageIcon,
} from "@/components/ui/icons";
import { PhotoCarousel } from "./photo-carousel";
import { PhotoUpload } from "./photo-upload";

const LABEL_CLS =
  "block text-sm font-medium text-[var(--text-default)]";
const HELP_CLS = "mt-1.5 text-xs text-[var(--text-muted)]";

type Mode =
  | {
      mode: "create";
      listId: string;
      place?: undefined;
      currentUserId: string;
      readOnly?: boolean;
    }
  | {
      mode: "edit";
      listId: string;
      place: Place;
      currentUserId: string;
      readOnly?: boolean;
    };

export function PlaceForm(props: Mode) {
  const action = props.mode === "create" ? createPlace : updatePlace;
  const [state, formAction, pending] = useActionState(action, { error: null });

  const place = props.place;
  const ownReason =
    place?.reasons.find((r) => r.user_id === props.currentUserId)?.text ?? "";
  const readOnly = props.readOnly === true;

  // photo URLs 改成 controlled，提供实时预览
  const [photoText, setPhotoText] = useState(
    (place?.photo_urls ?? []).join("\n"),
  );
  const previewUrls = photoText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
  // 默认收起 URL 编辑区，光看预览不被一堆链接刷屏
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);

  // readOnly 时不显示 `*`，因为用户不能填，显示反而误导
  const Req = readOnly ? null : (
    <span className="text-[var(--primary)]">*</span>
  );

  return (
    <form action={formAction} className="space-y-5">
      <fieldset disabled={readOnly} className="space-y-8">
        <input type="hidden" name="list_id" value={props.listId} />
        {place && <input type="hidden" name="place_id" value={place.id} />}

        {/* ============ 基本信息 ============ */}
        <section className="space-y-5">
          <div className="section-heading border-b border-[var(--border-subtle)] pb-2">
            <h2 className="text-lg">基本信息</h2>
          </div>

          <div>
            <label htmlFor="p-name" className={LABEL_CLS}>
              店名 {Req}
            </label>
            <input
              id="p-name"
              type="text"
              name="name"
              required
              maxLength={120}
              defaultValue={place?.name ?? ""}
              className="field-input mt-1.5"
            />
          </div>

          <div>
            <label htmlFor="p-address" className={LABEL_CLS}>
              地址 {Req}
            </label>
            <input
              id="p-address"
              type="text"
              name="address"
              required
              defaultValue={place?.address ?? ""}
              className="field-input mt-1.5"
            />
            <p className={HELP_CLS}>Phase 2 会接 Google Places 自动补全</p>
          </div>

          <div>
            <label htmlFor="p-cuisine" className={LABEL_CLS}>
              菜系 {Req}
            </label>
            <input
              id="p-cuisine"
              type="text"
              name="cuisine"
              required
              defaultValue={place?.cuisine.join(", ") ?? ""}
              placeholder="川菜、火锅"
              className="field-input mt-1.5"
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
                className="field-input mt-1.5"
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
                className="field-input mt-1.5"
              >
                <option value="">未填</option>
                <option value="$">$ · 人均 &lt; $15</option>
                <option value="$$">$$ · $15–30</option>
                <option value="$$$">$$$ · $30–60</option>
                <option value="$$$$">$$$$ · &gt; $60</option>
              </select>
            </div>
          </div>
        </section>

        {/* ============ 细节 ============ */}
        <section className="space-y-5">
          <div className="section-heading border-b border-[var(--border-subtle)] pb-2">
            <h2 className="text-lg">细节</h2>
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
              placeholder="约会、聚会、招待长辈"
              className="field-input mt-1.5"
            />
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
              placeholder="排队长、有露台、可带宠物"
              className="field-input mt-1.5"
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
              className="field-input mt-1.5"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="p-photos" className={LABEL_CLS}>
                图片{" "}
                {previewUrls.length > 0 && (
                  <span className="ml-1 text-xs font-normal text-[var(--text-faint)]">
                    · {previewUrls.length} 张
                  </span>
                )}
              </label>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setShowPhotoEditor((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-xs text-[var(--primary)] hover:underline"
                >
                  {showPhotoEditor ? (
                    <ChevronDownIcon size={12} />
                  ) : (
                    <ChevronRightIcon size={12} />
                  )}
                  {showPhotoEditor ? "收起 URL" : "编辑 URL"}
                </button>
              )}
            </div>
            {previewUrls.length > 0 && (
              <div className="mt-1.5">
                <PhotoCarousel urls={previewUrls} />
              </div>
            )}
            {previewUrls.length === 0 && !showPhotoEditor && (
              <div className="mt-1.5 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-5 text-center">
                <ImageIcon size={20} className="text-[var(--text-faint)]" />
                <p className="text-xs text-[var(--text-muted)]">
                  暂无图片 · 点下方上传，或右上「编辑 URL」贴链接
                </p>
              </div>
            )}
            {!readOnly && (
              <PhotoUpload
                className="mt-2"
                currentCount={previewUrls.length}
                onUploaded={(url) =>
                  setPhotoText((prev) => (prev ? `${prev}\n${url}` : url))
                }
              />
            )}
            {/* textarea 始终在 DOM（form 要提交），用 hidden 控制可见 */}
            <textarea
              id="p-photos"
              name="photo_urls_text"
              rows={3}
              value={photoText}
              onChange={(e) => setPhotoText(e.target.value)}
              placeholder={"每行一个 URL\nhttps://...\nhttps://..."}
              className={`field-input mt-2 resize-y font-mono text-xs ${
                showPhotoEditor ? "" : "hidden"
              }`}
            />
            {showPhotoEditor && (
              <p className={HELP_CLS}>
                第一张作为封面。XHS 抓取自动填好；想清空就删空。每行一个 https:// 才算有效
              </p>
            )}
          </div>
        </section>

        {/* ============ 理由 ============ */}
        <section className="space-y-5">
          <div className="section-heading border-b border-[var(--border-subtle)] pb-2">
            <h2 className="text-lg">理由</h2>
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
              className="field-input mt-1.5 resize-y"
            />
          </div>

          <div>
            <label htmlFor="p-notes" className={LABEL_CLS}>
              AI 综合判断 / 备注
            </label>
            <textarea
              id="p-notes"
              name="notes"
              rows={3}
              defaultValue={place?.notes ?? ""}
              placeholder="客观信号：评论区分歧、排队、营业时间、性价比、缺失信息…"
              className="field-input mt-1.5 resize-y"
            />
            <p className={HELP_CLS}>未来决策 agent 会读它做推荐</p>
          </div>
        </section>

        {state.error && (
          <p role="alert" className="alert-error">
            {state.error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Link
            href={`/lists/${props.listId}`}
            className="btn-secondary flex-1 py-3 text-base"
          >
            {readOnly ? "返回" : "取消"}
          </Link>
          {!readOnly && (
            <button
              type="submit"
              disabled={pending}
              className="btn-primary flex-1 py-3 text-base"
            >
              {pending
                ? "保存中…"
                : props.mode === "create"
                  ? "保存"
                  : "更新"}
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
