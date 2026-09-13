// POST /api/mobile/places/xhs-enrich { place_id, post_url }
// 「用这篇小红书更新店铺」：抓帖 → AI 抽取 → 合并进已有店铺。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import { enrichPlaceFromXhsPost } from "@/lib/actions/xhs-enrich";

export const runtime = "nodejs";

export const POST = mobileRoute(async ({ req }) => {
  const b = await readJsonBody<{ place_id?: unknown; post_url?: unknown }>(req);
  const r = await enrichPlaceFromXhsPost(str(b.place_id, 64), str(b.post_url, 1000));
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk(r);
});
