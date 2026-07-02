"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  extractPlacesFromText,
  extractPlacesFromImage,
  type ExtractedPlace,
} from "@/lib/llm/extract-place";
import { randomUUID } from "node:crypto";
import { validatePhotoFile } from "@/lib/storage/validate";
import { extractXhsUrl, scrapeXhsUrl, stripXhsUrl } from "@/lib/places/xhs";
import { findPlaceOnGoogle } from "@/lib/places/google";
import {
  mergeReasons,
  pickPhotosByIndices,
  unionStrings,
} from "@/lib/places/merge";
import { createClient, requireUser } from "@/lib/supabase/server";
import { normalizePhotoUrl } from "@/lib/storage/signed-photos";
import { mirrorPhotosToStorage } from "@/lib/storage/mirror-photos";
import { sendPushToUsers } from "@/lib/push/send";
import type { PlacePrice, PlaceStatus } from "@/lib/db/types";

// 共享清单加了新店 → 通知其他成员（best-effort，未配 push 静默跳过）
async function notifyListMembersNewPlace(
  supabase: SupabaseClient,
  actorId: string,
  listId: string,
  what: string,
): Promise<void> {
  const [{ data: list }, { data: members }, { data: actor }] =
    await Promise.all([
      supabase
        .from("lists")
        .select("name, owner_id")
        .eq("id", listId)
        .maybeSingle<{ name: string; owner_id: string }>(),
      supabase.from("list_members").select("user_id").eq("list_id", listId),
      supabase
        .from("profiles")
        .select("name, email")
        .eq("id", actorId)
        .maybeSingle<{ name: string | null; email: string }>(),
    ]);
  if (!list) return;
  const targets = [
    list.owner_id,
    ...(members ?? []).map((m) => m.user_id),
  ].filter((id) => id && id !== actorId);
  if (targets.length === 0) return;
  const who = actor?.name ?? actor?.email?.split("@")[0] ?? "有人";
  await sendPushToUsers(targets, {
    title: `「${list.name}」有新店`,
    body: `${who} 加了 ${what}`,
    url: `/lists/${listId}`,
  });
}

// Draft 存在 Supabase public.quick_add_drafts，按 user_id UPSERT
// 10 分钟 TTL（updated_at 比对）
const DRAFT_TTL_MS = 10 * 60 * 1000;

// 草稿类型：单店（用户在 /quick-add 确认）或多店（用户在 /quick-add/multi 勾选）
export type QuickAddDraft =
  | {
      kind: "single";
      rawInput: string;
      extracted: ExtractedPlace;
      source: "xhs" | "ai_extract";
      sourceUrl?: string;
      scrapeWarning?: string;
      photoUrls?: string[];
    }
  | {
      kind: "multi";
      rawInput: string;
      places: ExtractedPlace[];
      source: "xhs" | "ai_extract";
      sourceUrl?: string;
      scrapeWarning?: string;
      photoUrls?: string[]; // 合集帖：所有店共享同一篇帖子的图集
    };

export type QuickAddFormState = {
  error: string | null;
};

// ---- 入口 1：自由文本 / 小红书链接 → AI 提取（可能 1 家或 N 家）→ 跳确认页 ----
export async function processTextDraft(
  _prev: QuickAddFormState,
  formData: FormData,
): Promise<QuickAddFormState> {
  const user = await requireUser();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "请输入要识别的内容" };

  const xhsUrl = extractXhsUrl(text);
  let inputForAI = text;
  let source: "xhs" | "ai_extract" = "ai_extract";
  let sourceUrl: string | undefined;
  let scrapeWarning: string | undefined;
  let scrapedImages: string[] = [];

  if (xhsUrl) {
    source = "xhs";
    sourceUrl = xhsUrl;
    try {
      const scraped = await scrapeXhsUrl(xhsUrl);
      scrapedImages = scraped.images;
      const userText = stripXhsUrl(text);
      const pieces: string[] = [scraped.combinedText];
      if (userText) pieces.push(`（用户附言）${userText}`);
      // 告诉 LLM 图集大小，让 compilation 帖能正确算 photo_indices
      if (scrapedImages.length > 0) {
        pieces.push(
          `【图片】共 ${scrapedImages.length} 张，索引 0..${scrapedImages.length - 1}`,
        );
      }
      inputForAI = pieces.join("\n\n");
    } catch (err) {
      const userOnly = stripXhsUrl(text);
      if (!userOnly || userOnly.length < 5) {
        return {
          error:
            "小红书链接抓取失败：" +
            (err instanceof Error ? err.message : "未知错误") +
            "。请打开链接，复制正文粘贴进来。",
        };
      }
      inputForAI = userOnly;
      scrapeWarning =
        "小红书内容抓取失败，仅从你的附言识别。如果信息不全，可以再补一段正文。";
    }
  }

  const result = await extractPlacesFromText(inputForAI);
  if (!result.ok) return { error: result.error };

  // rawInput 留 1000 字够 debug，不影响 DB
  const truncatedInput =
    text.length > 1000 ? text.slice(0, 1000) + "…" : text;

  let draft: QuickAddDraft;
  if (result.places.length === 1) {
    draft = {
      kind: "single",
      rawInput: truncatedInput,
      extracted: result.places[0],
      source,
      sourceUrl,
      scrapeWarning,
      photoUrls: scrapedImages.length > 0 ? scrapedImages : undefined,
    };
  } else {
    draft = {
      kind: "multi",
      rawInput: truncatedInput,
      places: result.places,
      source,
      sourceUrl,
      scrapeWarning,
      photoUrls: scrapedImages.length > 0 ? scrapedImages : undefined,
    };
  }

  const supabase = await createClient();

  const { error: upsertError } = await supabase
    .from("quick_add_drafts")
    .upsert(
      { user_id: user.id, data: draft },
      { onConflict: "user_id" },
    );

  if (upsertError) {
    return { error: `保存草稿失败：${upsertError.message}` };
  }

  redirect(draft.kind === "multi" ? "/quick-add/multi" : "/quick-add?source=text");
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

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await extractPlacesFromImage(
    { base64: buf.toString("base64"), mimeType: file.type },
    String(formData.get("hint") ?? ""),
  );
  if (!result.ok) return { error: result.error };

  // 照片本体存进自己的 bucket，作为店铺封面（best-effort，失败不阻断）
  const supabase = await createClient();
  let photoUrl: string | undefined;
  {
    const path = `${user.id}/qa-${Date.now()}-${randomUUID().slice(0, 8)}.${validation.ext}`;
    const { error: upErr } = await supabase.storage
      .from("photos")
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (!upErr) {
      const { data } = supabase.storage.from("photos").getPublicUrl(path);
      photoUrl = data?.publicUrl ?? undefined;
    }
  }

  const draft: QuickAddDraft =
    result.places.length === 1
      ? {
          kind: "single",
          rawInput: "（拍照识别）",
          extracted: result.places[0],
          source: "ai_extract",
          photoUrls: photoUrl ? [photoUrl] : undefined,
        }
      : {
          kind: "multi",
          rawInput: "（拍照识别）",
          places: result.places,
          source: "ai_extract",
          photoUrls: photoUrl ? [photoUrl] : undefined,
        };

  const { error: upsertError } = await supabase
    .from("quick_add_drafts")
    .upsert({ user_id: user.id, data: draft }, { onConflict: "user_id" });
  if (upsertError) return { error: `保存草稿失败：${upsertError.message}` };

  redirect(draft.kind === "multi" ? "/quick-add/multi" : "/quick-add?source=text");
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

// ---- helpers ----
const VALID_STATUS: PlaceStatus[] = ["want_to_go", "visited", "archived"];
const VALID_PRICE: PlacePrice[] = ["$", "$$", "$$$", "$$$$"];

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseStatus(raw: FormDataEntryValue | null): PlaceStatus {
  return VALID_STATUS.includes(raw as PlaceStatus)
    ? (raw as PlaceStatus)
    : "want_to_go";
}

function parsePrice(raw: FormDataEntryValue | null): PlacePrice | null {
  if (typeof raw !== "string" || raw === "") return null;
  return VALID_PRICE.includes(raw as PlacePrice) ? (raw as PlacePrice) : null;
}

const SOURCE_VALUES = [
  "manual",
  "xhs",
  "ai_extract",
  "google_places",
  "yelp",
] as const;
type SourceValue = (typeof SOURCE_VALUES)[number];

function parseSource(raw: FormDataEntryValue | null): SourceValue {
  return SOURCE_VALUES.includes(raw as SourceValue)
    ? (raw as SourceValue)
    : "manual";
}

// ---- 去重 + 合并 helper ----------------------------------------------------
// 按 (list_id, name) 检测是否已存在；存在则 UPDATE，否则 INSERT。
// reasons 合并规则：
//   - overrideMyReason=true（单店表单，用户编辑过）：替换当前 user 的 reason
//   - overrideMyReason=false（批量从 AI 抽取，未手编）：仅在用户尚无 reason 时追加

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type UpsertCandidate = {
  list_id: string;
  name: string;
  address: string;
  cuisine: string[];
  price_range: PlacePrice | null;
  status: PlaceStatus;
  occasions: string[];
  tags: string[];
  recommended_by: string | null;
  myReason: string | null; // 当前用户的 reason（空 = 不动）
  notes: string | null;
  dishes: string[];
  photo_urls: string[];
  source: SourceValue;
  source_url: string | null;
  google_place_id: string | null;
  google_rating: number | null;
  google_rating_count: number | null;
  google_maps_uri: string | null;
  lat: number | null;
  lng: number | null;
};

async function upsertPlaces(
  supabase: SupabaseClient,
  userId: string,
  candidates: UpsertCandidate[],
  options: { overrideMyReason: boolean },
): Promise<{ inserted: number; updated: number; error: string | null }> {
  if (candidates.length === 0) {
    return { inserted: 0, updated: 0, error: null };
  }

  const listId = candidates[0].list_id;
  const names = candidates.map((c) => c.name);

  // 一次查出 list 里同名 place，含所有要合并的字段
  const { data: existingRows, error: lookupError } = await supabase
    .from("places")
    .select(
      "id, name, reasons, notes, photo_urls, cuisine, tags, occasions, dishes",
    )
    .eq("list_id", listId)
    .in("name", names);

  if (lookupError) {
    return { inserted: 0, updated: 0, error: lookupError.message };
  }

  type ExistingRow = {
    id: string;
    name: string;
    reasons: unknown;
    notes: string | null;
    photo_urls: unknown;
    cuisine: unknown;
    tags: unknown;
    occasions: unknown;
    dishes: unknown;
  };
  const existingByName = new Map<string, ExistingRow>();
  for (const row of (existingRows ?? []) as ExistingRow[]) {
    existingByName.set(row.name, row);
  }

  // 加店自动丰富：给还没有 google_place_id 的候选并行在 Google 上找一下，
  // 拿评分 / 评价数 / 精确坐标 / 地图链接（best-effort，失败/没找到就跳过，不阻断加店）
  await Promise.all(
    candidates.map(async (c) => {
      if (c.google_place_id) return;
      const query = [c.name, c.address].filter(Boolean).join(" ");
      const m = await findPlaceOnGoogle(query);
      if (!m) return;
      c.google_place_id = m.placeId;
      c.google_rating = m.rating;
      c.google_rating_count = m.ratingCount;
      c.google_maps_uri = m.mapsUri;
      if (c.lat == null && m.lat != null && m.lng != null) {
        c.lat = m.lat;
        c.lng = m.lng;
      }
    }),
  );

  let inserted = 0;
  let updated = 0;

  for (const c of candidates) {
    const existing = existingByName.get(c.name);

    if (existing) {
      // ---- 智能合并 ----
      const reasons = mergeReasons(
        existing.reasons,
        userId,
        c.myReason,
        options.overrideMyReason,
      );

      // notes: 已有非空内容 → 保留用户手编的；空 → 用 AI 新生成
      const notes =
        existing.notes && existing.notes.trim().length > 0
          ? existing.notes
          : c.notes;

      // 数组类字段 union 去重（保留既有 + 加入新的）
      const photo_urls = unionStrings(existing.photo_urls, c.photo_urls);
      const cuisine = unionStrings(existing.cuisine, c.cuisine);
      const tags = unionStrings(existing.tags, c.tags);
      const occasions = unionStrings(existing.occasions, c.occasions);
      const dishes = unionStrings(existing.dishes, c.dishes);

      // Google 字段只在这次拿到了才写（不要用 null 覆盖既有评分/坐标）
      const googleFields = c.google_place_id
        ? {
            google_place_id: c.google_place_id,
            google_rating: c.google_rating,
            google_rating_count: c.google_rating_count,
            google_maps_uri: c.google_maps_uri,
            ...(c.lat != null && c.lng != null
              ? { lat: c.lat, lng: c.lng }
              : {}),
          }
        : {};

      // 客观字段：用最新覆盖
      const updateFields = {
        address: c.address,
        price_range: c.price_range,
        status: c.status,
        recommended_by: c.recommended_by,
        source: c.source,
        source_url: c.source_url,
        // merged
        reasons,
        notes,
        photo_urls,
        cuisine,
        tags,
        occasions,
        dishes,
        ...googleFields,
      };

      const { error } = await supabase
        .from("places")
        .update(updateFields)
        .eq("id", existing.id);
      if (error) return { inserted, updated, error: error.message };
      updated++;
    } else {
      // 新增：直接写
      const reasons = mergeReasons(
        null,
        userId,
        c.myReason,
        options.overrideMyReason,
      );
      const { error } = await supabase.from("places").insert({
        list_id: c.list_id,
        name: c.name,
        address: c.address,
        cuisine: c.cuisine,
        price_range: c.price_range,
        status: c.status,
        occasions: c.occasions,
        tags: c.tags,
        recommended_by: c.recommended_by,
        reasons,
        notes: c.notes,
        dishes: c.dishes,
        photo_urls: c.photo_urls,
        source: c.source,
        source_url: c.source_url,
        google_place_id: c.google_place_id,
        google_rating: c.google_rating,
        google_rating_count: c.google_rating_count,
        google_maps_uri: c.google_maps_uri,
        lat: c.lat,
        lng: c.lng,
        created_by: userId,
      });
      if (error) return { inserted, updated, error: error.message };
      inserted++;
    }
  }

  return { inserted, updated, error: null };
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
  if (cuisine.length === 0) return { error: "请填写至少一个菜系标签" };

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
  const rawPhotoUrls = String(formData.get("photo_urls_text") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    // 用户从页面复制到的自家图是 7 天 signed URL，落库前转回 canonical
    .map((s) => normalizePhotoUrl(s));

  const supabase = await createClient();
  // XHS CDN 图会过期，落库前转存到自己的 bucket（失败回退原 URL）
  const photoUrls = await mirrorPhotosToStorage(supabase, user.id, rawPhotoUrls);
  const { inserted, updated, error } = await upsertPlaces(
    supabase,
    user.id,
    [
      {
        list_id: listId,
        name,
        address,
        cuisine,
        price_range: parsePrice(formData.get("price_range")),
        status: parseStatus(formData.get("status")),
        occasions: parseTags(formData.get("occasions")),
        tags: parseTags(formData.get("tags")),
        recommended_by:
          String(formData.get("recommended_by") ?? "").trim() || null,
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
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      },
    ],
    { overrideMyReason: true },
  );

  if (error) return { error: `保存失败：${error}` };

  if (inserted > 0) {
    await notifyListMembersNewPlace(supabase, user.id, listId, `「${name}」`);
  }

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
    .filter((p): p is ExtractedPlace => Boolean(p));

  if (selected.length === 0) {
    return { error: "选择无效，请重试" };
  }

  // XHS CDN 图会过期，转存到自己的 bucket。只转存"会被用到"的索引
  // （勾选店铺的 photo_indices 并集；有店没标 indices = 回退全图 → 全转存），
  // 避免给没勾选的店白转存孤儿图。数组顺序原样保留（photo_indices 依赖）。
  const supabase = await createClient();
  const rawPhotos = draft.photoUrls ?? [];
  let allPhotos = rawPhotos;
  if (rawPhotos.length > 0) {
    const needAll = selected.some(
      (p) => !p.photo_indices || p.photo_indices.length === 0,
    );
    if (needAll) {
      allPhotos = await mirrorPhotosToStorage(supabase, user.id, rawPhotos);
    } else {
      const needed = new Set(
        selected.flatMap((p) => p.photo_indices ?? []),
      );
      const toMirror = rawPhotos.filter((_, i) => needed.has(i));
      const mirrored = await mirrorPhotosToStorage(supabase, user.id, toMirror);
      // filter 保序：rawPhotos 里第 j 个"被需要"的元素 == toMirror[j] == mirrored[j]
      let j = 0;
      allPhotos = rawPhotos.map((u, i) => (needed.has(i) ? mirrored[j++] : u));
    }
  }

  const candidates: UpsertCandidate[] = selected.map((p) => ({
    list_id: listId,
    name: p.name,
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
    // AI 标了 photo_indices 就按它分；没标 → 全部图（用户后续可编辑）
    photo_urls: pickPhotosByIndices(p.photo_indices, allPhotos),
    source: draft.source,
    source_url: draft.sourceUrl ?? null,
    google_place_id: null,
    google_rating: null,
    google_rating_count: null,
    google_maps_uri: null,
    lat: null,
    lng: null,
  }));

  const { inserted, updated, error } = await upsertPlaces(
    supabase,
    user.id,
    candidates,
    { overrideMyReason: false },
  );

  if (error) return { error: `批量保存失败：${error}` };

  if (inserted > 0) {
    await notifyListMembersNewPlace(
      supabase,
      user.id,
      listId,
      inserted === 1 ? "1 家新店" : `${inserted} 家新店`,
    );
  }

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
