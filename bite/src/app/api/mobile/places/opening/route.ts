// GET /api/mobile/places/opening?placeId=<google_place_id>
// 实时营业状态（best-effort；查不到返回 { opening: null }，App 不显示该行）。

import { jsonError, jsonOk, mobileRoute } from "@/lib/supabase/mobile-auth";
import { fetchOpeningInfo } from "@/lib/places/google";

export const runtime = "nodejs";

export const GET = mobileRoute(async ({ req }) => {
  const url = new URL(req.url);
  const placeId = (url.searchParams.get("placeId") ?? "").trim().slice(0, 200);
  if (!placeId) return jsonError("缺少 placeId");
  const opening = await fetchOpeningInfo(placeId);
  return jsonOk({ opening });
});
