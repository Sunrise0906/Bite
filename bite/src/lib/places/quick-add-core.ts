// 智能添加的核心逻辑（**不是** server action 文件）。
//
// 网页的 server action（lib/actions/quick-add.ts）和 iOS 的 mobile API
// （app/api/mobile/quick-add/*）共用这一份：抓小红书 → AI 抽取 → 合并写库。
// 这里不碰草稿表、不 redirect、不 revalidatePath —— 那些是网页流程的壳，
// 由各自的调用方负责。这样 CLAUDE.md 那条「写入面只在 lib/actions」的不变量
// 对网页仍然成立，而 App 的写入走 route handler + 同一份合并逻辑，不会分叉。

import { randomUUID } from "node:crypto";
import {
  extractPlacesFromImage,
  extractPlacesFromText,
  type ExtractedPlace,
} from "@/lib/llm/extract-place";
import { extractXhsUrl, scrapeXhsUrl, stripXhsUrl } from "@/lib/places/xhs";
import { findPlaceOnGoogle } from "@/lib/places/google";
import { isPlaceDomain, type PlaceDomain } from "@/lib/places/domain";
import {
  buildUpsertPlan,
  EXISTING_PLACE_COLUMNS,
  type ExistingPlaceRow,
  type UpsertCandidate,
} from "@/lib/places/upsert-plan";
import { indexByName, normalizeName } from "@/lib/places/name-key";
import { fetchPlaceNameRows } from "@/lib/db/place-names";
import { mirrorPhotosToStorage } from "@/lib/storage/mirror-photos";
import { notifyListMembersNewPlace } from "@/lib/push/notify-list";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = ServerSupabaseClient;

export type QuickAddSource = "xhs" | "ai_extract";

// 草稿类型：单店（用户在 /quick-add 确认）或多店（用户在 /quick-add/multi 勾选）。
// iOS 端不落库，直接拿这个结构在内存里走确认流程（见 serializeDraft）。
export type QuickAddDraft =
  | {
      kind: "single";
      rawInput: string;
      extracted: ExtractedPlace;
      source: QuickAddSource;
      sourceUrl?: string;
      scrapeWarning?: string;
      photoUrls?: string[];
      /** 从某个清单页发起时的目标清单 —— 确认页据此预选，省得用户再挑一次 */
      targetListId?: string;
    }
  | {
      kind: "multi";
      rawInput: string;
      places: ExtractedPlace[];
      source: QuickAddSource;
      sourceUrl?: string;
      scrapeWarning?: string;
      photoUrls?: string[]; // 合集帖：所有店共享同一篇帖子的图集
      /** 从某个清单页发起时的目标清单 */
      targetListId?: string;
    };

export type BuildDraftResult =
  | { ok: true; draft: QuickAddDraft }
  | { ok: false; error: string };

/**
 * 目标清单的领域，用来让抽取按「吃/喝/玩」各自的口径理解字段。
 * 查不到（没传 / 不可读）就返回 undefined —— 抽取会走领域中立的通用 prompt。
 */
export async function domainOfList(
  supabase: SupabaseClient,
  listId: string | undefined,
): Promise<PlaceDomain | undefined> {
  if (!listId) return undefined;
  const { data } = await supabase
    .from("lists")
    .select("category")
    .eq("id", listId)
    .maybeSingle<{ category: string }>();
  return isPlaceDomain(data?.category) ? data.category : undefined;
}

function toDraft(
  places: ExtractedPlace[],
  base: {
    rawInput: string;
    source: QuickAddSource;
    sourceUrl?: string;
    scrapeWarning?: string;
    photoUrls?: string[];
    targetListId?: string;
  },
): QuickAddDraft {
  if (places.length === 1) {
    return { kind: "single", extracted: places[0], ...base };
  }
  return { kind: "multi", places, ...base };
}

// ---- 入口 1：自由文本 / 小红书链接 → AI 提取（可能 1 家或 N 家）----
export async function buildTextDraft(
  supabase: SupabaseClient,
  rawText: string,
  targetListId?: string,
): Promise<BuildDraftResult> {
  const text = rawText.trim();
  if (!text) return { ok: false, error: "请输入要识别的内容" };

  const xhsUrl = extractXhsUrl(text);
  let inputForAI = text;
  let source: QuickAddSource = "ai_extract";
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
          ok: false,
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

  const domain = await domainOfList(supabase, targetListId);
  const result = await extractPlacesFromText(inputForAI, domain);
  if (!result.ok) return { ok: false, error: result.error };

  // rawInput 留 1000 字够 debug，不影响 DB
  const truncatedInput = text.length > 1000 ? text.slice(0, 1000) + "…" : text;

  return {
    ok: true,
    draft: toDraft(result.places, {
      rawInput: truncatedInput,
      source,
      sourceUrl,
      scrapeWarning,
      photoUrls: scrapedImages.length > 0 ? scrapedImages : undefined,
      targetListId,
    }),
  };
}

// ---- 入口 1b：拍照识店（菜单照 / 店面照 / 帖子截图）----
export async function buildImageDraft(
  supabase: SupabaseClient,
  userId: string,
  file: { buffer: Buffer; mimeType: string; ext: string },
  hint: string,
  targetListId?: string,
): Promise<BuildDraftResult> {
  const domain = await domainOfList(supabase, targetListId);
  const result = await extractPlacesFromImage(
    { base64: file.buffer.toString("base64"), mimeType: file.mimeType },
    hint,
    domain,
  );
  if (!result.ok) return { ok: false, error: result.error };

  // 照片本体存进自己的 bucket，作为店铺封面（best-effort，失败不阻断）
  let photoUrl: string | undefined;
  {
    const path = `${userId}/qa-${Date.now()}-${randomUUID().slice(0, 8)}.${file.ext}`;
    const { error: upErr } = await supabase.storage
      .from("photos")
      .upload(path, file.buffer, { contentType: file.mimeType, upsert: false });
    if (!upErr) {
      const { data } = supabase.storage.from("photos").getPublicUrl(path);
      photoUrl = data?.publicUrl ?? undefined;
    }
  }

  return {
    ok: true,
    draft: toDraft(result.places, {
      rawInput: "（拍照识别）",
      source: "ai_extract",
      photoUrls: photoUrl ? [photoUrl] : undefined,
      targetListId,
    }),
  };
}

/** 给 iOS 的统一形状：单店也当成长度 1 的数组，客户端只处理一种结构。 */
export type SerializedDraft = {
  mode: "single" | "multi";
  places: ExtractedPlace[];
  source: QuickAddSource;
  source_url: string | null;
  scrape_warning: string | null;
  photo_urls: string[];
  target_list_id: string | null;
};

export function serializeDraft(draft: QuickAddDraft): SerializedDraft {
  return {
    mode: draft.kind,
    places: draft.kind === "single" ? [draft.extracted] : draft.places,
    source: draft.source,
    source_url: draft.sourceUrl ?? null,
    scrape_warning: draft.scrapeWarning ?? null,
    photo_urls: draft.photoUrls ?? [],
    target_list_id: draft.targetListId ?? null,
  };
}

// ---- helpers ----

export const SOURCE_VALUES = [
  "manual",
  "xhs",
  "ai_extract",
  "google_places",
  "yelp",
] as const;
export type SourceValue = (typeof SOURCE_VALUES)[number];

export function parseSource(raw: unknown): SourceValue {
  return SOURCE_VALUES.includes(raw as SourceValue)
    ? (raw as SourceValue)
    : "manual";
}

// ---- 去重 + 合并 ----------------------------------------------------------
// 按 (list_id, 归一化 name) 检测是否已存在；存在则 UPDATE，否则 INSERT。
// reasons 合并规则：
//   - overrideMyReason=true（单店表单，用户编辑过）：替换当前 user 的 reason
//   - overrideMyReason=false（批量从 AI 抽取，未手编）：仅在用户尚无 reason 时追加

export async function upsertPlaces(
  supabase: SupabaseClient,
  userId: string,
  candidates: UpsertCandidate[],
  options: { overrideMyReason: boolean },
): Promise<{ inserted: number; updated: number; error: string | null }> {
  if (candidates.length === 0) {
    return { inserted: 0, updated: 0, error: null };
  }

  const listId = candidates[0].list_id;

  // ⚠️ 不能用 .in("name", names) —— 那是逐字节相等，而去重键现在是**归一化**后的名字
  // （「MOri’s」和「MOri's」必须算同一家，见 lib/places/name-key.ts）。
  // SQL 侧做不了这个匹配，所以先拉这个 list 的 (id, name) 轻量列表在内存里配，
  // 再只把命中的那几行的完整合并字段查回来。两步都很便宜，且不随清单变大而变重。
  let nameRows: Awaited<ReturnType<typeof fetchPlaceNameRows>>;
  try {
    nameRows = await fetchPlaceNameRows(supabase, [listId]);
  } catch (err) {
    return {
      inserted: 0,
      updated: 0,
      error: err instanceof Error ? err.message : "查询失败",
    };
  }

  const byKey = indexByName(nameRows);
  const hitIds = [
    ...new Set(
      candidates
        .map((c) => byKey.get(normalizeName(c.name))?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const existingByName = new Map<string, ExistingPlaceRow>();
  if (hitIds.length > 0) {
    const { data: fullRows, error: fullError } = await supabase
      .from("places")
      .select(EXISTING_PLACE_COLUMNS)
      .in("id", hitIds);
    if (fullError) {
      return { inserted: 0, updated: 0, error: fullError.message };
    }
    for (const row of (fullRows ?? []) as unknown as ExistingPlaceRow[]) {
      existingByName.set(normalizeName(row.name), row);
    }
  }

  // 加店自动丰富：在 Google 上找一下，拿评分 / 评价数 / 精确坐标 / 地图链接
  // （best-effort，失败/没找到就跳过，不阻断加店）
  await Promise.all(
    candidates.map(async (c) => {
      // 已经有 place_id **且**已经有口碑数据 → 不用再查。
      // 只有 place_id 没评分的（店名搜索路径，getPlaceDetails 的 fieldMask 不含
      // rating/userRatingCount）仍要查一次，否则这家店永远没有评分可用于决策。
      if (c.google_place_id && c.google_rating != null) return;

      const hadAuthoritativeId = Boolean(c.google_place_id);
      const query = [c.name, c.address].filter(Boolean).join(" ");
      const m = await findPlaceOnGoogle(query);
      if (!m) return;

      // 用户从 autocomplete 里亲手选的 place_id 是权威的；文本搜索可能匹配到
      // 另一家同名店（连锁分店），所以只在它和我们已有的 id 一致时才采纳口碑数据，
      // 且永远不覆盖已有的 place_id。
      if (hadAuthoritativeId) {
        if (m.placeId !== c.google_place_id) return;
      } else {
        c.google_place_id = m.placeId;
      }
      c.google_rating = m.rating;
      c.google_rating_count = m.ratingCount;
      c.google_maps_uri = m.mapsUri;
      c.website_uri = m.websiteUri;
      if (c.lat == null && m.lat != null && m.lng != null) {
        c.lat = m.lat;
        c.lng = m.lng;
      }
    }),
  );

  // 决策层（该 INSERT 还是 UPDATE、写哪些字段）已抽成纯函数并单测覆盖，
  // 见 lib/places/upsert-plan.ts。这里只负责执行。
  const steps = buildUpsertPlan(candidates, existingByName, userId, options);

  let inserted = 0;
  let updated = 0;

  for (const step of steps) {
    if (step.kind === "update") {
      // RLS 挡掉写入时 Postgres 不报错、只影响 0 行 —— 必须回读行数，
      // 否则 UI 会显示「已更新」而库里毫无变化（见 CLAUDE.md）
      const { data, error } = await supabase
        .from("places")
        .update(step.fields)
        .eq("id", step.id)
        .select("id");
      if (error) return { inserted, updated, error: error.message };
      if (!data || data.length === 0) {
        return { inserted, updated, error: "没有权限修改这家店" };
      }
      updated++;
    } else {
      const { data, error } = await supabase
        .from("places")
        .insert(step.row)
        .select("id");
      if (error) return { inserted, updated, error: error.message };
      if (!data || data.length === 0) {
        return { inserted, updated, error: "没有权限往这个清单加店" };
      }
      inserted++;
    }
  }

  return { inserted, updated, error: null };
}

/**
 * XHS CDN 图会过期，落库前转存到自己的 bucket。跨候选去重：同一张图被多家店引用
 * （合集帖没标 photo_indices 时每家都拿全图）只下载一次。顺序原样保留。
 */
async function mirrorCandidatePhotos(
  supabase: SupabaseClient,
  userId: string,
  candidates: UpsertCandidate[],
): Promise<void> {
  const unique = [...new Set(candidates.flatMap((c) => c.photo_urls))];
  if (unique.length === 0) return;
  const mirrored = await mirrorPhotosToStorage(supabase, userId, unique);
  const map = new Map(unique.map((u, i) => [u, mirrored[i]]));
  for (const c of candidates) {
    c.photo_urls = c.photo_urls.map((u) => map.get(u) ?? u);
  }
}

/**
 * 把一批候选写进某个清单：转存图片 → 去重合并 → 通知共享清单的其他成员。
 * 网页的单店 / 合集帖保存和 iOS 的保存都走这里。
 */
export async function saveCandidatesToList(
  supabase: SupabaseClient,
  userId: string,
  listId: string,
  candidates: UpsertCandidate[],
  options: { overrideMyReason: boolean },
): Promise<{ inserted: number; updated: number; error: string | null }> {
  if (candidates.length === 0) return { inserted: 0, updated: 0, error: null };
  for (const c of candidates) c.list_id = listId;

  await mirrorCandidatePhotos(supabase, userId, candidates);

  const result = await upsertPlaces(supabase, userId, candidates, options);
  if (result.error) return result;

  if (result.inserted > 0) {
    const what =
      result.inserted === 1 && candidates.length === 1
        ? `「${candidates[0].name}」`
        : result.inserted === 1
          ? "1 家新店"
          : `${result.inserted} 家新店`;
    await notifyListMembersNewPlace(supabase, userId, listId, what);
  }
  return result;
}
