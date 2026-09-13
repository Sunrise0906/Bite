// POST /api/mobile/recommendations/accept { id, target_list_id } —— 接受推荐。
// 目标清单里已有同名店时会按 web 同一套规则合并（理由去重追加 / 数组并集 / notes 保留已有），
// 所以走服务端复用 acceptRecommendation，不在 App 里再抄一份合并逻辑。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import { acceptRecommendation } from "@/lib/actions/recommendations";

export const runtime = "nodejs";

export const POST = mobileRoute(async ({ req }) => {
  const b = await readJsonBody<Record<string, unknown>>(req);
  const r = await acceptRecommendation({
    id: str(b.id, 64),
    target_list_id: str(b.target_list_id, 64),
  });
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk(r);
});
