"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { findPlaceOnGoogle } from "@/lib/places/google";
import { distanceMiles, medianCenter } from "@/lib/places/distance";

// 坐标和它自己的 Google 匹配结果差出这么多 → 判定为脏数据，用 Google 的覆盖掉。
// 定得很宽：同城不同分店、用户手工微调都远够不着，只有「匹配到了别的地方」才会触发。
const COORD_CONFLICT_MILES = 200;
// 离「用户所有店的中位数中心」这么远的，拉进本轮丰富重新核对一次。
const COORD_OUTLIER_MILES = 300;

export type EnrichResult =
  | { ok: true; enriched: number; tried: number; healed: number }
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
  if (listIds.length === 0)
    return { ok: true, enriched: 0, tried: 0, healed: 0 };

  const { data: places, error } = await supabase
    .from("places")
    .select("id, name, address, lat, lng")
    .in("list_id", listIds)
    // 缺评分**或**缺菜单链接都要补 —— 老店已经有评分了，但 website_uri 是
    // 后加的字段（sql/0021），只看 google_rating 的话它们永远补不上
    .or("google_rating.is.null,website_uri.is.null")
    .limit(25);
  if (error) return { error: `查询失败：${error.message}` };

  type Row = {
    id: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  };
  const rows = (places ?? []) as Row[];

  // 坐标离群的店也拉进来重核一次。它们通常**评分和菜单链接都全**，
  // 上面那个 .or 过滤永远选不到 —— 于是一个错到别的国家的坐标会一直烂在库里。
  const { data: coordRows } = await supabase
    .from("places")
    .select("id, name, address, lat, lng")
    .in("list_id", listIds)
    .not("lat", "is", null)
    .not("lng", "is", null);
  const withCoords = (coordRows ?? []) as Row[];
  const center = medianCenter(
    withCoords.map((p) => ({ lat: p.lat!, lng: p.lng! })),
  );
  if (center) {
    const have = new Set(rows.map((r) => r.id));
    for (const p of withCoords) {
      if (rows.length >= 25) break;
      if (have.has(p.id)) continue;
      if (distanceMiles(center, { lat: p.lat!, lng: p.lng! }) > COORD_OUTLIER_MILES) {
        rows.push(p);
      }
    }
  }

  let enriched = 0;
  let healed = 0;
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
    // 没坐标的用 Google 精确坐标补上。
    //
    // 已有坐标的原则上不覆盖（用户可能手工调过），但有一个例外：坐标和它自己的
    // Google 匹配结果**差出几百英里**时，那不是「用户的偏好」，是脏数据。
    // 真实案例：New Duong Son BBQ 的 place_id 和评分都是 Westminster CA 那家，
    // 坐标却落在越南 —— 只要这条不覆盖的规则还在，它就永远是错的，
    // 而地图 fitBounds 会因为这一家把视野撑成整张世界地图。
    if (match.lat != null && match.lng != null) {
      const contradicts =
        p.lat != null &&
        p.lng != null &&
        distanceMiles({ lat: p.lat, lng: p.lng }, { lat: match.lat, lng: match.lng }) >
          COORD_CONFLICT_MILES;
      if (p.lat == null || contradicts) {
        update.lat = match.lat;
        update.lng = match.lng;
        if (contradicts) healed++;
      }
    }
    const { error: upErr } = await supabase
      .from("places")
      .update(update)
      .eq("id", p.id);
    if (!upErr) enriched++;
  }

  revalidatePath("/map");
  return { ok: true, enriched, tried: rows.length, healed };
}
