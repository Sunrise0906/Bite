// GET /api/mobile/pick?list_id=… —— 进入「一起选」：拿 active session + 候选卡片（封面已签名）。

import { jsonError, jsonOk, mobileRoute } from "@/lib/supabase/mobile-auth";
import { getOrCreatePickSession } from "@/lib/actions/pick";

export const runtime = "nodejs";

export const GET = mobileRoute(async ({ req }) => {
  const listId = (new URL(req.url).searchParams.get("list_id") ?? "").trim();
  if (!listId) return jsonError("缺少 list_id");
  const r = await getOrCreatePickSession(listId);
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk(r);
});
