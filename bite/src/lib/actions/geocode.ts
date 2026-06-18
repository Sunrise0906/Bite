"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/places/google";

export type BackfillResult =
  | { ok: true; updated: number; tried: number }
  | { error: string };

/**
 * 给当前用户「有地址、没坐标」的店批量补经纬度（让它们能上地图）。
 * 一次最多处理 40 家，避免长跑 / 配额打满；可重复点直到补完。
 * 只能更新自己有写权限的店（RLS 兜底，viewer 的会被拒并跳过）。
 */
export async function backfillPlaceCoords(): Promise<BackfillResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: ownerLists }, { data: memberLists }] = await Promise.all([
    supabase.from("lists").select("id").eq("owner_id", user.id),
    supabase.from("list_members").select("list_id").eq("user_id", user.id),
  ]);
  const listIds = [
    ...(ownerLists ?? []).map((l) => l.id),
    ...(memberLists ?? []).map((m) => m.list_id),
  ];
  if (listIds.length === 0) return { ok: true, updated: 0, tried: 0 };

  const { data: places, error } = await supabase
    .from("places")
    .select("id, address")
    .in("list_id", listIds)
    .is("lat", null)
    .not("address", "is", null)
    .neq("address", "")
    .limit(40);
  if (error) return { error: `查询失败：${error.message}` };

  const rows = (places ?? []) as Array<{ id: string; address: string }>;
  let updated = 0;
  for (const p of rows) {
    const geo = await geocodeAddress(p.address);
    if (!geo) continue;
    const { error: upErr } = await supabase
      .from("places")
      .update({ lat: geo.lat, lng: geo.lng })
      .eq("id", p.id);
    if (!upErr) updated++;
  }

  revalidatePath("/map");
  return { ok: true, updated, tried: rows.length };
}
