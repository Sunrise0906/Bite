// GET /api/mobile/places/details?placeId=…&session=…
// 用户从补全里选了一家 → 拉 Google Place Details（店名 / 地址 / 坐标 / 类型 → 菜系推断）。

import { jsonError, jsonOk, mobileRoute } from "@/lib/supabase/mobile-auth";
import { getPlaceDetails, inferCuisineFromTypes } from "@/lib/places/google";

export const runtime = "nodejs";

export const GET = mobileRoute(async ({ req }) => {
  const url = new URL(req.url);
  const placeId = (url.searchParams.get("placeId") ?? "").trim().slice(0, 200);
  if (!placeId) return jsonError("缺少 placeId");
  const session = url.searchParams.get("session")?.slice(0, 80) || undefined;
  try {
    const d = await getPlaceDetails(placeId, session);
    const cuisine = inferCuisineFromTypes(d.primaryType, d.types);
    return jsonOk({
      place_id: d.placeId,
      name: d.name || "（未填）",
      address: d.formattedAddress || "（未填）",
      lat: d.lat,
      lng: d.lng,
      cuisine: cuisine.length > 0 ? cuisine : ["餐厅"],
      website_uri: d.websiteUri,
    });
  } catch (err) {
    return jsonError(
      "拉取 Google Places 详情失败：" +
        (err instanceof Error ? err.message : "未知错误"),
      502,
    );
  }
});
