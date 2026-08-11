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
import { normalizeName } from "@/lib/places/name-key";
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
  // 「新值为空就保留旧值」需要知道旧值是什么，所以这几个也要查出来
  address: string;
  price_range: PlacePrice | null;
  status: PlaceStatus;
  recommended_by: string | null;
  source_url: string | null;
};

/** 查 ExistingPlaceRow 用的 select 列表 —— 和上面的类型保持同步 */
export const EXISTING_PLACE_COLUMNS =
  "id, name, reasons, notes, photo_urls, cuisine, tags, occasions, dishes, address, price_range, status, recommended_by, source_url";

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

/** 空值不覆盖：候选没给（null / 空串）时保留库里已有的值。 */
function keepIfBlank<T>(next: T | null | undefined, prev: T): T {
  if (next == null) return prev;
  if (typeof next === "string" && next.trim().length === 0) return prev;
  return next;
}

/**
 * 合并时的状态取舍。
 *
 * ⚠️ `want_to_go` 同时是「用户明确选的想去」和「解析不出来时的兜底值」
 * （parseStatus 对缺失/非法一律回落到它）。所以让它覆盖已有状态，等于
 * 「小红书帖子没提去没去过」就把你标好的**已去过**悄悄打回想去。
 * 反过来，标成 visited / archived 是明确动作，可以覆盖。
 */
function mergeStatus(prev: PlaceStatus, next: PlaceStatus): PlaceStatus {
  if (next === "want_to_go" && prev !== "want_to_go") return prev;
  return next;
}

/**
 * 算出每个候选的写入计划。
 *
 * 合并语义：
 * - `reasons` —— 交给 mergeReasons：只动当前用户自己那条，别人的原样保留
 * - `notes`   —— 已有非空内容优先（那多半是用户手编的），空才用 AI 新生成的
 * - 数组字段  —— union 去重，既有的不丢
 * - 客观字段（地址/价位/推荐来源/来源链接）—— **新值非空才覆盖**。
 *   曾经是无条件覆盖，于是「手填了 $$、小红书没提价位」合并一次价位就没了；
 *   手填的精确门牌号也会被抽取 prompt 只要求「大致区域」的地址冲掉。
 * - `status` —— 见 mergeStatus
 * - Google 口碑 —— 见 googleFieldsFor
 *
 * @param existingByName 库里同名行，key 是 **normalizeName(name)**
 *   （去重键的归一化见 lib/places/name-key.ts；历史背景见 docs/decisions/0002）
 */
export function buildUpsertPlan(
  candidates: readonly UpsertCandidate[],
  existingByName: ReadonlyMap<string, ExistingPlaceRow>,
  userId: string,
  options: { overrideMyReason: boolean },
): UpsertStep[] {
  const steps: UpsertStep[] = [];
  // 批内簿记：同一批里第二个同名候选要落到第一条上，而不是再产出一条重复记录。
  // （ADR 0002 把这条列为「零风险的那一半」—— 合集帖里 AI 抽出两条同名很常见，
  // 尤其是它被 few-shot 教着对认不出的条目输出「（未知）」。）
  // seen 记录的是「算到这一步为止，这个 key 的状态」，包括本批刚决定要插的那些。
  const seen = new Map<string, ExistingPlaceRow>(existingByName);
  const stepByKey = new Map<string, UpsertStep>();

  for (const c of candidates) {
    const key = normalizeName(c.name);
    const existing = seen.get(key);

    // 合并后的完整字段（insert 和 update 共用，保证两条路的语义不会分叉）
    const merged = {
      address: existing ? keepIfBlank(c.address, existing.address) : c.address,
      price_range: existing
        ? keepIfBlank(c.price_range, existing.price_range)
        : c.price_range,
      status: existing ? mergeStatus(existing.status, c.status) : c.status,
      recommended_by: existing
        ? keepIfBlank(c.recommended_by, existing.recommended_by)
        : c.recommended_by,
      source: c.source,
      source_url: existing
        ? keepIfBlank(c.source_url, existing.source_url)
        : c.source_url,
      reasons: mergeReasons(
        existing?.reasons ?? null,
        userId,
        c.myReason,
        options.overrideMyReason,
      ),
      notes:
        existing?.notes && existing.notes.trim().length > 0
          ? existing.notes
          : c.notes,
      photo_urls: unionStrings(existing?.photo_urls, c.photo_urls),
      cuisine: unionStrings(existing?.cuisine, c.cuisine),
      tags: unionStrings(existing?.tags, c.tags),
      occasions: unionStrings(existing?.occasions, c.occasions),
      dishes: unionStrings(existing?.dishes, c.dishes),
    };

    const prior = stepByKey.get(key);
    if (prior) {
      // 本批里已经为这个名字排过一步了 —— 就地并进去，不再多产出一步。
      // 否则要么插两条重复，要么对同一行发两次 UPDATE。
      if (prior.kind === "update") {
        prior.fields = { ...prior.fields, ...merged, ...googleFieldsFor(c) };
      } else {
        prior.row = { ...prior.row, ...merged, ...googleFieldsFor(c) };
      }
    } else if (existing) {
      const step: UpsertStep = {
        kind: "update",
        id: existing.id,
        fields: { ...merged, ...googleFieldsFor(c) },
      };
      steps.push(step);
      stepByKey.set(key, step);
    } else {
      const step: UpsertStep = {
        kind: "insert",
        row: {
          list_id: c.list_id,
          name: c.name,
          ...merged,
          google_place_id: c.google_place_id,
          google_rating: c.google_rating,
          google_rating_count: c.google_rating_count,
          google_maps_uri: c.google_maps_uri,
          website_uri: c.website_uri,
          lat: c.lat,
          lng: c.lng,
          created_by: userId,
        },
      };
      steps.push(step);
      stepByKey.set(key, step);
    }

    // 刷新 seen，让同批的下一个同名候选看到合并后的状态
    seen.set(key, {
      id: existing?.id ?? "",
      name: existing?.name ?? c.name,
      reasons: merged.reasons,
      notes: merged.notes,
      photo_urls: merged.photo_urls,
      cuisine: merged.cuisine,
      tags: merged.tags,
      occasions: merged.occasions,
      dishes: merged.dishes,
      address: merged.address,
      price_range: merged.price_range,
      status: merged.status,
      recommended_by: merged.recommended_by,
      source_url: merged.source_url,
    });
  }

  return steps;
}
