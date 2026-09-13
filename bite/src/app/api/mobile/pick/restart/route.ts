// POST /api/mobile/pick/restart { list_id, session_id } —— 再来一轮。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import { restartPickSession } from "@/lib/actions/pick";

export const runtime = "nodejs";

export const POST = mobileRoute(async ({ req }) => {
  const b = await readJsonBody<Record<string, unknown>>(req);
  const listId = str(b.list_id, 64);
  const sessionId = str(b.session_id, 64);
  if (!listId || !sessionId) return jsonError("缺少 list_id / session_id");
  const r = await restartPickSession(listId, sessionId);
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk(r);
});
