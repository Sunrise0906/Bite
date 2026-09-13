// POST /api/mobile/comments { place_id, body } —— 留言（要通知清单里的其他人，所以走服务端）。
// 读 / 删留言 App 直连 Supabase（RLS：读得到清单的人能读，只能删自己的）。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import { addComment } from "@/lib/actions/comments";

export const runtime = "nodejs";

export const POST = mobileRoute(async ({ req }) => {
  const b = await readJsonBody<{ place_id?: unknown; body?: unknown }>(req);
  const r = await addComment(str(b.place_id, 64), str(b.body, 1000));
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk({ comment: r.comment });
});
