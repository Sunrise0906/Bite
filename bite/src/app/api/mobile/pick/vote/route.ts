// POST /api/mobile/pick/vote { session_id, place_id, vote } —— 投一票；凑够多数就匹配 + 推送全员。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import { castPickVote } from "@/lib/actions/pick";

export const runtime = "nodejs";

export const POST = mobileRoute(async ({ req }) => {
  const b = await readJsonBody<Record<string, unknown>>(req);
  const sessionId = str(b.session_id, 64);
  const placeId = str(b.place_id, 64);
  if (!sessionId || !placeId) return jsonError("缺少 session_id / place_id");
  const r = await castPickVote(sessionId, placeId, b.vote === true);
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk(r);
});
