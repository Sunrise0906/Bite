// 加店/合并的**决策层**：给定候选 + 库里已有的同名行，算出每家店该 INSERT 还是
// UPDATE、以及具体写哪些字段。
//
// 为什么单独抽出来：这是全应用风险最高的一段逻辑——它决定用户手写的理由何时被覆盖、
// 哪些照片挂到哪家店、Google 评分会不会被 null 冲掉。原先它埋在一个 server action 里、
// 夹在活的 Supabase client 中间，**根本没法单测**。
// 叶子 helper（unionStrings / mergeReasons）早就抽进 merge.ts 并配了测试，
// 抽取只是停在了编排层没做完。
//
// 这里是纯函数：无 I/O、无 Supabase。调用方负责查库、执行返回的计划。

import { mergeReasons, unionStrings } from "@/lib/places/merge";
import type { PlacePrice, PlaceStatus } from "@/lib/db/types";

export type UpsertSource =
  | "manual"
  | "xhs"
  | "ai_extract"
  | "google_places"
  | "yelp";

export type UpsertCandidate = {
  list_id: string;
  name: string;
  address: string;
  cuisine: string[];
  price_range: PlacePrice | null;
  status: PlaceStatus;
  occasions: string[];
  tags: string[];
  recommended_by: string | null;
  /** 当前用户的 reason（null/空 = 不动） */
  myReason: string | null;
  notes: string | null;
  dishes: string[];
  photo_urls: string[];
  source: UpsertSource;
  source_url: string | null;
  google_place_id: string | null;
  google_rating: number | null;
  google_rating_count: number | null;
  google_maps_uri: string | null;
  /** Places 的 websiteUri —— 餐厅多为点单/菜单页 */
  website_uri: string | null;
  lat: number | null;
  lng: number | null;
};

/** 库里已存在的同名行。数组类字段用 unknown —— 来自 DB 的 jsonb/text[] 不可信。 */
export type ExistingPlaceRow = {
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

export type UpsertStep =
  | { kind: "update"; id: string; fields: Record<string, unknown> }
  | { kind: "insert"; row: Record<string, unknown> };

/**
 * Google 口碑字段：**逐字段判空**。
 *
 * ⚠️ 不能只判 google_place_id 就整包写入：走「店名搜索」路径时候选带着真实的
 * google_place_id 但 rating/ratingCount/mapsUri 全是 null（getPlaceDetails 的
 * fieldMask 不含口碑字段）——整包写就会把库里已有的评分静默清成 null。
 * 评分是「决策」那一半产品读的主要信号，丢了没有任何报错。
 */
export function googleFieldsFor(c: UpsertCandidate): Record<string, unknown> {
  if (!c.google_place_id) return {};
  return {
    google_place_id: c.google_place_id,
    ...(c.google_rating != null ? { google_rating: c.google_rating } : {}),
    ...(c.google_rating_count != null
      ? { google_rating_count: c.google_rating_count }
      : {}),
    ...(c.google_maps_uri ? { google_maps_uri: c.google_maps_uri } : {}),
    ...(c.website_uri ? { website_uri: c.website_uri } : {}),
    ...(c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : {}),
  };
}

/**
 * 算出每个候选的写入计划。
 *
 * 合并语义：
 * - `reasons` —— 交给 mergeReasons：只动当前用户自己那条，别人的原样保留
 * - `notes`   —— 已有非空内容优先（那多半是用户手编的），空才用 AI 新生成的
 * - 数组字段  —— union 去重，既有的不丢
 * - 客观字段（地址/价位/状态/来源）—— 用最新覆盖
 * - Google 口碑 —— 见 googleFieldsFor
 *
 * @param existingByName 库里同名行，key 必须与 candidate.name 完全一致
 *   （现行去重键就是 (list_id, name) 精确字符串相等，见 docs/decisions/0002）
 */
export function buildUpsertPlan(
  candidates: readonly UpsertCandidate[],
  existingByName: ReadonlyMap<string, ExistingPlaceRow>,
  userId: string,
  options: { overrideMyReason: boolean },
): UpsertStep[] {
  const steps: UpsertStep[] = [];

  for (const c of candidates) {
    const existing = existingByName.get(c.name);

    if (existing) {
      steps.push({
        kind: "update",
        id: existing.id,
        fields: {
          // 客观字段：用最新覆盖
          address: c.address,
          price_range: c.price_range,
          status: c.status,
          recommended_by: c.recommended_by,
          source: c.source,
          source_url: c.source_url,
          // 合并字段
          reasons: mergeReasons(
            existing.reasons,
            userId,
            c.myReason,
            options.overrideMyReason,
          ),
          notes:
            existing.notes && existing.notes.trim().length > 0
              ? existing.notes
              : c.notes,
          photo_urls: unionStrings(existing.photo_urls, c.photo_urls),
          cuisine: unionStrings(existing.cuisine, c.cuisine),
          tags: unionStrings(existing.tags, c.tags),
          occasions: unionStrings(existing.occasions, c.occasions),
          dishes: unionStrings(existing.dishes, c.dishes),
          ...googleFieldsFor(c),
        },
      });
    } else {
      steps.push({
        kind: "insert",
        row: {
          list_id: c.list_id,
          name: c.name,
          address: c.address,
          cuisine: c.cuisine,
          price_range: c.price_range,
          status: c.status,
          occasions: c.occasions,
          tags: c.tags,
          recommended_by: c.recommended_by,
          reasons: mergeReasons(
            null,
            userId,
            c.myReason,
            options.overrideMyReason,
          ),
          notes: c.notes,
          dishes: c.dishes,
          photo_urls: c.photo_urls,
          source: c.source,
          source_url: c.source_url,
          google_place_id: c.google_place_id,
          google_rating: c.google_rating,
          google_rating_count: c.google_rating_count,
          google_maps_uri: c.google_maps_uri,
          website_uri: c.website_uri,
          lat: c.lat,
          lng: c.lng,
          created_by: userId,
        },
      });
    }
  }

  return steps;
}
