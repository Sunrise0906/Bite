// POST /api/mobile/places/enrich —— 「在 Google 上丰富」：评分 + 坐标 + 菜单链接回填。
// 直接复用网页的 server action（请求作用域让它以 App 用户身份跑）。

import { jsonError, jsonOk, mobileRoute } from "@/lib/supabase/mobile-auth";
import { enrichPlacesFromGoogle } from "@/lib/actions/enrich";

export const runtime = "nodejs";

export const POST = mobileRoute(async () => {
  const r = await enrichPlacesFromGoogle();
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk(r);
});
