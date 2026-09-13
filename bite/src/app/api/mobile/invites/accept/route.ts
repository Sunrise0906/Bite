// POST /api/mobile/invites/accept { token } —— 接受邀请（原子 RPC + 通知发起人）。
// 预览走 App 直连 RPC get_invite_preview；创建 / 撤销邀请也直连（RLS）。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import { acceptListInvite } from "@/lib/actions/invites";

export const runtime = "nodejs";

export const POST = mobileRoute(async ({ req }) => {
  const b = await readJsonBody<{ token?: unknown }>(req);
  const r = await acceptListInvite(str(b.token, 64));
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk(r);
});
