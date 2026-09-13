"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ExtractedPlace } from "@/lib/llm/extract-place";
import { validatePhotoFile } from "@/lib/storage/validate";
import { pickPhotosByIndices } from "@/lib/places/merge";
import type { UpsertCandidate } from "@/lib/places/upsert-plan";
import { createClient, requireUser } from "@/lib/supabase/server";
import { normalizePhotoUrl } from "@/lib/storage/signed-photos";
import { parseTags, parseStatus, parsePrice } from "@/lib/places/parse-form";
import {
  buildImageDraft,
  buildTextDraft,
  parseSource,
  saveCandidatesToList,
  type QuickAddDraft,
} from "@/lib/places/quick-add-core";

// 抓取 / 抽取 / 合并写库的核心在 lib/places/quick-add-core.ts（iOS 的 mobile API
// 也用它）。这个文件只剩网页流程的壳：草稿表 + redirect + revalidate。

export type { QuickAddDraft } from "@/lib/places/quick-add-core";

// Draft 存在 Supabase public.quick_add_drafts，按 user_id UPSERT
// 10 分钟 TTL（updated_at 比对）
const DRAFT_TTL_MS = 10 * 60 * 1000;

export type QuickAddFormState = {
  error: string | null;
};

async function storeDraft(
  userId: string,
  draft: QuickAddDraft,
): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("quick_add_drafts")
    .upsert({ user_id: userId, data: draft }, { onConflict: "user_id" });
  return error ? `保存草稿失败：${error.message}` : null;
}

// ---- 入口 1：自由文本 / 小红书链接 → AI 提取（可能 1 家或 N 家）→ 跳确认页 ----
export async function processTextDraft(
  _prev: QuickAddFormState,
  formData: FormData,
): Promise<QuickAddFormState> {
  const user = await requireUser();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "请输入要识别的内容" };
  // 从清单页发起时带着目标清单；确认页会校验它确实可写后再预选
  const targetListId = String(formData.get("target_list_id") ?? "") || undefined;

  const supabase = await createClient();
  const built = await buildTextDraft(supabase, text, targetListId);
  if (!built.ok) return { error: built.error };

  const storeError = await storeDraft(user.id, built.draft);
  if (storeError) return { error: storeError };

  redirect(built.draft.kind === "multi" ? "/quick-add/multi" : "/quick-add?source=text");
}

// ---- 入口 1b：拍照识店（菜单照 / 店面照 / 帖子截图）----
export async function processImageDraft(
  _prev: QuickAddFormState,
  formData: FormData,
): Promise<QuickAddFormState> {
  const user = await requireUser();

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "请选择一张照片" };
  }
  const validation = validatePhotoFile({
    size: file.size,
    type: file.type,
    name: file.name,
  });
  if (!validation.ok) return { error: validation.error };

  const targetListId = String(formData.get("target_list_id") ?? "") || undefined;
  const buffer = Buffer.from(await file.arrayBuffer());
  const supabase = await createClient();
  const built = await buildImageDraft(
    supabase,
    user.id,
    { buffer, mimeType: file.type, ext: validation.ext },
    String(formData.get("hint") ?? ""),
    targetListId,
  );
  if (!built.ok) return { error: built.error };

  const storeError = await storeDraft(user.id, built.draft);
  if (storeError) return { error: storeError };

  redirect(built.draft.kind === "multi" ? "/quick-add/multi" : "/quick-add?source=text");
}

// ---- 读 draft（10 分钟 TTL）----
export async function readDraft(): Promise<QuickAddDraft | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quick_add_drafts")
    .select("data, updated_at")
    .maybeSingle();

  if (error || !data) return null;

  // TTL 检查
  const updatedAt = new Date(data.updated_at as string).getTime();
  if (Date.now() - updatedAt > DRAFT_TTL_MS) {
    // 过期了顺手清掉
    await supabase.from("quick_add_drafts").delete().not("user_id", "is", null);
    return null;
  }

  return data.data as QuickAddDraft;
}

export async function clearDraft() {
  const supabase = await createClient();
  // RLS 自动限定到当前用户
  await supabase.from("quick_add_drafts").delete().not("user_id", "is", null);
}

// ---- 入口 2a：单店确认页提交 → 写入 places ----
export async function savePlaceFromDraft(
  _prev: QuickAddFormState,
  formData: FormData,
): Promise<QuickAddFormState> {
  const user = await requireUser();

  const listId = String(formData.get("list_id") ?? "");
  if (!listId) return { error: "请选择要添加到的 list" };

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const cuisine = parseTags(formData.get("cuisine"));

  if (!name) return { error: "店名不能为空" };
  if (!address) return { error: "地址不能为空" };
  if (cuisine.length === 0) return { error: "请填写至少一个类型标签（吃=菜系 / 喝=品类 / 玩=类型）" };

  const source = parseSource(formData.get("source"));
  const sourceUrl = String(formData.get("source_url") ?? "").trim() || null;
  const googlePlaceId =
    String(formData.get("google_place_id") ?? "").trim() || null;
  const latRaw = String(formData.get("lat") ?? "").trim();
  const lngRaw = String(formData.get("lng") ?? "").trim();
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;

  const reasonText = String(formData.get("reason") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const photoUrls = String(formData.get("photo_urls_text") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    // 用户从页面复制到的自家图是 7 天 signed URL，落库前转回 canonical
    .map((s) => normalizePhotoUrl(s));

  const candidate: UpsertCandidate = {
    list_id: listId,
    name,
    address,
    cuisine,
    price_range: parsePrice(formData.get("price_range")),
    status: parseStatus(formData.get("status")),
    occasions: parseTags(formData.get("occasions")),
    tags: parseTags(formData.get("tags")),
    recommended_by: String(formData.get("recommended_by") ?? "").trim() || null,
    myReason: reasonText,
    notes,
    dishes: parseTags(formData.get("dishes")),
    photo_urls: photoUrls,
    source,
    source_url: sourceUrl,
    google_place_id: googlePlaceId,
    google_rating: null,
    google_rating_count: null,
    google_maps_uri: null,
    // 置 null：upsertPlaces 的自动丰富会去查 Google 并回填（那里也拿 websiteUri）
    website_uri: null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };

  const supabase = await createClient();
  const { updated, error } = await saveCandidatesToList(
    supabase,
    user.id,
    listId,
    [candidate],
    { overrideMyReason: true },
  );
  if (error) return { error: `保存失败：${error}` };

  await clearDraft();
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
  const toastKey = updated > 0 ? "place_updated" : "place_added";
  redirect(`/lists/${listId}?toast=${toastKey}`);
}

// ---- 入口 2b：多店批量保存 ----
export async function savePlacesBatch(
  _prev: QuickAddFormState,
  formData: FormData,
): Promise<QuickAddFormState> {
  const user = await requireUser();

  const listId = String(formData.get("list_id") ?? "");
  if (!listId) return { error: "请选择要添加到的 list" };

  // 勾选了哪些 index（字符串形式）
  const selectedIndices = formData
    .getAll("selected")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0);

  if (selectedIndices.length === 0) {
    return { error: "请至少勾选一家店" };
  }

  const draft = await readDraft();
  if (!draft || draft.kind !== "multi") {
    return { error: "草稿已过期或丢失，请回去重新粘贴链接" };
  }

  const selected = selectedIndices
    .map((i) => draft.places[i])
    .filter((p): p is ExtractedPlace => Boolean(p))
    // ⚠️ 抽取的 few-shot 明确教模型：认不出的条目就把名字写成「（未知）」。
    // 批量这条路以前完全不校验，于是每篇合集帖的垃圾条目都合并进同一行「（未知）」，
    // 不断往里堆别家的菜品、照片、理由 —— 讽刺的是那反而是全库合并得最积极的一行。
    .filter((p) => {
      const n = p.name?.trim();
      return Boolean(n) && n !== "（未知）" && n !== "(未知)";
    });

  if (selected.length === 0) {
    return { error: "这些条目没识别出店名，换个帖子或手动填一下" };
  }

  // 图片：AI 标了 photo_indices 就按它分；没标 → 全部图（用户后续可编辑）。
  // 这里给的还是小红书原始 URL，saveCandidatesToList 会跨候选去重后转存。
  const rawPhotos = draft.photoUrls ?? [];

  const candidates: UpsertCandidate[] = selected.map((p) => ({
    list_id: listId,
    // 单店那条路一直有 trim，批量这条没有 —— LLM 输出里的首尾空白会原样落库，
    // 而且那行名字之后再也匹配不上任何东西（别的路径都 trim 过）
    name: p.name.trim(),
    address: p.address,
    cuisine: p.cuisine,
    price_range: p.price_range ?? null,
    status: p.status ?? "want_to_go",
    occasions: p.occasions ?? [],
    tags: p.tags ?? [],
    recommended_by:
      p.recommended_by ?? (draft.source === "xhs" ? "XHS博主" : null),
    myReason: p.reason ?? null,
    notes: p.notes ?? null,
    dishes: p.dishes ?? [],
    photo_urls: pickPhotosByIndices(p.photo_indices, rawPhotos),
    source: draft.source,
    source_url: draft.sourceUrl ?? null,
    google_place_id: null,
    google_rating: null,
    google_rating_count: null,
    google_maps_uri: null,
    website_uri: null,
    lat: null,
    lng: null,
  }));

  const supabase = await createClient();
  const { inserted, updated, error } = await saveCandidatesToList(
    supabase,
    user.id,
    listId,
    candidates,
    { overrideMyReason: false },
  );

  if (error) return { error: `批量保存失败：${error}` };

  await clearDraft();
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
  const total = inserted + updated;
  redirect(
    `/lists/${listId}?toast=places_added&count=${total}` +
      (updated > 0 ? `&updated=${updated}` : ""),
  );
}

// ---- 取消：清 draft 跳回 /lists ----
export async function cancelQuickAdd() {
  await clearDraft();
  redirect("/lists");
}
