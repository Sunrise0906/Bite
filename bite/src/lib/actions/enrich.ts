"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { findPlaceOnGoogle } from "@/lib/places/google";

export type EnrichResult =
  | { ok: true; enriched: number; tried: number }
  | { error: string };

/**
 * 「Google 口碑丰富」：给当前用户「还没拉过 Google 评分」的店在 Google 上找到对应店铺，
 * 存评分 / 评价数 / 地图链接 / google_place_id，并用 Google 的精确坐标补 lat/lng
 * （比模糊 geocoding 准）。一次最多 25 家（每家一个 Text Search），可重复点。
 */
export async function enrichPlacesFromGoogle(): Promise<EnrichResult> {
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
  if (listIds.length === 0) return { ok: true, enriched: 0, tried: 0 };

  const { data: places, error } = await supabase
    .from("places")
    .select("id, name, address, lat, lng")
    .in("list_id", listIds)
    // 缺评分**或**缺菜单链接都要补 —— 老店已经有评分了，但 website_uri 是
    // 后加的字段（sql/0021），只看 google_rating 的话它们永远补不上
    .or("google_rating.is.null,website_uri.is.null")
    .limit(25);
  if (error) return { error: `查询失败：${error.message}` };

  const rows = (places ?? []) as Array<{
    id: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  }>;

  let enriched = 0;
  for (const p of rows) {
    const query = [p.name, p.address].filter(Boolean).join(" ");
    const match = await findPlaceOnGoogle(query);
    if (!match) continue;

    // 逐字段判空：Google 这次没给的字段不要写进去，否则会把库里已有的值冲成 null
    // （评分曾经就是这么被静默清空过的，见 lib/places/upsert-plan.ts 的注释）
    const update: Record<string, unknown> = { google_place_id: match.placeId };
    if (match.rating != null) update.google_rating = match.rating;
    if (match.ratingCount != null) update.google_rating_count = match.ratingCount;
    if (match.mapsUri) update.google_maps_uri = match.mapsUri;
    if (match.websiteUri) update.website_uri = match.websiteUri;
    if (Object.keys(update).length === 1) continue; // 只有 place_id，没啥可写
    // 没坐标的用 Google 精确坐标补上（已有坐标的不覆盖）
    if (p.lat == null && match.lat != null && match.lng != null) {
      update.lat = match.lat;
      update.lng = match.lng;
    }
    const { error: upErr } = await supabase
      .from("places")
      .update(update)
      .eq("id", p.id);
    if (!upErr) enriched++;
  }

  revalidatePath("/map");
  return { ok: true, enriched, tried: rows.length };
}
