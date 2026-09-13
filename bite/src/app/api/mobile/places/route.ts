// POST /api/mobile/places —— 手写建店（校验 / 归一化查重 / 插入 / 通知共享成员）。
// 编辑走 App 直连 Supabase（RLS），因为编辑不需要服务端副作用。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
  strList,
} from "@/lib/supabase/mobile-auth";
import { createPlaceCore } from "@/lib/places/create-place";
import { parsePrice, parseStatus } from "@/lib/places/parse-form";
import { normalizePhotoUrl } from "@/lib/storage/signed-photos";

export const runtime = "nodejs";

export const POST = mobileRoute(async ({ req, scope }) => {
  const b = await readJsonBody<Record<string, unknown>>(req);
  const result = await createPlaceCore(scope.supabase, scope.user.id, {
    listId: str(b.list_id, 64),
    name: str(b.name, 120),
    address: str(b.address, 300),
    cuisine: strList(b.cuisine),
    priceRange: parsePrice(str(b.price_range, 8)),
    status: parseStatus(str(b.status, 20)),
    occasions: strList(b.occasions),
    tags: strList(b.tags),
    recommendedBy: str(b.recommended_by, 80) || null,
    reason: str(b.reason, 500) || null,
    notes: str(b.notes, 4000) || null,
    photoUrls: strList(b.photo_urls)
      .filter((u) => /^https?:\/\//i.test(u))
      .map((u) => normalizePhotoUrl(u)),
  });
  if (!result.ok) return jsonError(result.error, 422);
  return jsonOk({ id: result.id });
});
