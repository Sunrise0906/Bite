"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { deleteTier, upsertTier } from "@/lib/db/ratings";
import { parseTier, type PlaceTier } from "@/lib/places/tier";

// 快捷评价：夯 / 顶级 / 人上人 / NPC / 拉完了。
//
// 和另外两套评价的分工（详见 sql/0028 的文件头）：
//   - visit_logs.sentiment  = 这一次去完，还来不来（绑定造访，必填）
//   - visit_logs.star_rating = 这一次几星（绑定造访，选填）
//   - place_ratings.tier    = 这家店几档（对整家店，一键，不需要先记造访）
//
// 每人各评各的，口径同 places.reasons —— 共享清单里「我夯她 NPC」是有意义的信息，
// 不该被合并或求平均。

export type SetTierResult = { ok: true; tier: PlaceTier | null } | { error: string };

/**
 * 设置 / 清除当前用户对某家店的档位。
 *
 * @param tier 1..5（1 最好）；传 null 表示撤销自己的评价。
 *   ⚠️ 别凭直觉把大的当好的 —— 极性说明见 lib/places/tier.ts。
 */
export async function setPlaceTier(
  placeId: string,
  tier: number | null,
): Promise<SetTierResult> {
  const user = await requireUser();
  if (!placeId) return { error: "缺少 place_id" };

  // 客户端可能传任意值；解析不出来就当「清除」，绝不把垃圾写进库
  const parsed = tier === null ? null : parseTier(tier);
  if (tier !== null && parsed === null) {
    return { error: "不认识这个档位" };
  }

  const supabase = await createClient();

  // list_id 从 place 反查，不信客户端 —— 否则能把评价挂到别人清单的店上。
  // 查不到 = RLS 挡住了（不是这个清单的人）或店已删。
  const { data: place } = await supabase
    .from("places")
    .select("id, list_id")
    .eq("id", placeId)
    .maybeSingle<{ id: string; list_id: string }>();
  if (!place) return { error: "找不到这家店（或没有权限）" };

  const result =
    parsed === null
      ? await deleteTier(supabase, { placeId, userId: user.id })
      : await upsertTier(supabase, {
          placeId,
          listId: place.list_id,
          userId: user.id,
          tier: parsed,
        });

  if ("error" in result) return result;

  revalidatePath(`/lists/${place.list_id}`);
  revalidatePath(`/lists/${place.list_id}/places/${placeId}`);
  return { ok: true, tier: parsed };
}
