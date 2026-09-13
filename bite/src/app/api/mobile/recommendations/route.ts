// POST /api/mobile/recommendations { to_email, place_id, message? } —— 推荐给朋友。
// 需要按邮箱找人 + 发邮件 + 推送，所以走服务端；接受 / 拒绝 / 撤回 App 直连 Supabase。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import { sendRecommendation } from "@/lib/actions/recommendations";

export const runtime = "nodejs";

export const POST = mobileRoute(async ({ req }) => {
  const b = await readJsonBody<Record<string, unknown>>(req);
  const r = await sendRecommendation({
    to_email: str(b.to_email, 200),
    place_id: str(b.place_id, 64),
    message: str(b.message, 200) || undefined,
  });
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk(r);
});
