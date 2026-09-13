// 快捷评价（档位）的持久化助手。仅在 server 用。
//
// 放在 lib/db 而不是 lib/actions：写入面的**入口**仍然只有 server action
// （actions/ratings.ts 和 actions/visits.ts），这里是两者共用的那一段 ——
// 同 lib/db/chat.ts 的分工。CLAUDE.md 那条不变量约束的是带顶部指令那种文件的位置，
// 不是「所有 SQL 都必须内联在 action 里」。
//
// ⚠️ 上面这句别改回把指令名原样写出来：那条不变量是一句 grep 字面量，
// 注释里出现同样的字符串就会把检查绊倒（cd8a8d6 已经踩过一次）。
//
// 表结构 / RLS / 极性说明见 sql/0028；档位常量见 lib/places/tier.ts。

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlaceTier, type PlaceTier, type TierRow } from "@/lib/places/tier";

/** 表还没建时 Postgres 报的码。功能是增量上线的，未跑 migration 不该白屏 */
const UNDEFINED_TABLE = "42P01";

export const RATINGS_MISSING_TABLE_MESSAGE =
  "快捷评价还没启用（数据库还没跑 sql/0028）";

function toRows(data: unknown): TierRow[] {
  const rows = (data ?? []) as Array<{ user_id: string; tier: number }>;
  const out: TierRow[] = [];
  for (const r of rows) {
    if (r?.user_id && isPlaceTier(r.tier)) {
      out.push({ user_id: r.user_id, tier: r.tier });
    }
  }
  return out;
}

/**
 * 批量拉一组店的全部评价，返回 place_id → 行数组。
 *
 * ⚠️ 表不存在（还没跑 0028）时返回空 Map 而不是抛错 —— 清单页不该因为一个
 * 增量功能没上 migration 就整页 500。列表里的评价 chip 会全部显示成「未评」，
 * 用户一点会看到明确提示（见 actions/ratings.ts 的 42P01 分支）。
 */
export async function fetchTiersForPlaces(
  supabase: SupabaseClient,
  placeIds: readonly string[],
): Promise<Map<string, TierRow[]>> {
  const out = new Map<string, TierRow[]>();
  const ids = [...new Set(placeIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from("place_ratings")
    .select("place_id, user_id, tier")
    .in("place_id", ids);

  if (error) return out;

  for (const r of (data ?? []) as Array<{
    place_id: string;
    user_id: string;
    tier: number;
  }>) {
    if (!isPlaceTier(r.tier)) continue;
    const arr = out.get(r.place_id) ?? [];
    arr.push({ user_id: r.user_id, tier: r.tier });
    out.set(r.place_id, arr);
  }
  return out;
}

/** 单店版本（详情页用） */
export async function fetchTiersForPlace(
  supabase: SupabaseClient,
  placeId: string,
): Promise<TierRow[]> {
  const { data, error } = await supabase
    .from("place_ratings")
    .select("user_id, tier")
    .eq("place_id", placeId);
  if (error) return [];
  return toRows(data);
}

export type WriteTierResult = { ok: true } | { error: string };

/**
 * 写入 / 覆盖当前用户对某家店的档位。
 *
 * list_id 必须由调用方从 **place 反查**得到，不能信客户端传的 —— 否则可以
 * 拿一个自己有权限的 list_id 把评价挂到别人清单的店上。
 * （DB 侧 sql/0028 的复合外键也会拦住，这里是第二道。）
 */
export async function upsertTier(
  supabase: SupabaseClient,
  args: { placeId: string; listId: string; userId: string; tier: PlaceTier },
): Promise<WriteTierResult> {
  const { data, error } = await supabase
    .from("place_ratings")
    .upsert(
      {
        place_id: args.placeId,
        list_id: args.listId,
        user_id: args.userId,
        tier: args.tier,
      },
      { onConflict: "place_id,user_id" },
    )
    // RLS 挡掉时 Postgres 不报错、只影响 0 行（见 CLAUDE.md）
    .select("place_id");

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { error: RATINGS_MISSING_TABLE_MESSAGE };
    }
    return { error: `评价失败：${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "你没有这个清单的访问权限" };
  }
  return { ok: true };
}

/** 撤销自己的档位。已经没有那条时也算成功（幂等，用户看到的就是「清掉了」）。 */
export async function deleteTier(
  supabase: SupabaseClient,
  args: { placeId: string; userId: string },
): Promise<WriteTierResult> {
  const { error } = await supabase
    .from("place_ratings")
    .delete()
    .eq("place_id", args.placeId)
    .eq("user_id", args.userId);

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { error: RATINGS_MISSING_TABLE_MESSAGE };
    }
    return { error: `撤销失败：${error.message}` };
  }
  return { ok: true };
}
