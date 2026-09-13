// POST /api/mobile/quick-add/save —— iOS 的智能添加第二步：确认后的候选写进清单。
// 走和网页完全相同的合并语义（归一化查重 / 空值不覆盖 / 理由只动自己那条 /
// Google 自动丰富 / 小红书图转存 / 通知共享成员），见 lib/places/quick-add-core.ts。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  num,
  readJsonBody,
  str,
  strList,
} from "@/lib/supabase/mobile-auth";
import { parseSource, saveCandidatesToList } from "@/lib/places/quick-add-core";
import { parsePrice, parseStatus } from "@/lib/places/parse-form";
import { normalizePhotoUrl } from "@/lib/storage/signed-photos";
import type { UpsertCandidate } from "@/lib/places/upsert-plan";

export const runtime = "nodejs";

type Body = {
  list_id?: unknown;
  override_my_reason?: unknown;
  candidates?: unknown;
};

function toCandidate(raw: unknown, listId: string): UpsertCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const name = str(c.name, 120);
  const address = str(c.address, 300);
  const cuisine = strList(c.cuisine);
  // 抽取的 few-shot 教模型把认不出的条目写成「（未知）」，那种不能落库
  if (!name || name === "（未知）" || name === "(未知)") return null;
  if (!address || cuisine.length === 0) return null;
  return {
    list_id: listId,
    name,
    address,
    cuisine,
    price_range: parsePrice(str(c.price_range, 8)),
    status: parseStatus(str(c.status, 20)),
    occasions: strList(c.occasions),
    tags: strList(c.tags),
    recommended_by: str(c.recommended_by, 80) || null,
    myReason: str(c.reason, 500) || null,
    notes: str(c.notes, 4000) || null,
    dishes: strList(c.dishes).slice(0, 12),
    photo_urls: strList(c.photo_urls)
      .filter((u) => /^https?:\/\//i.test(u))
      .map((u) => normalizePhotoUrl(u)),
    source: parseSource(str(c.source, 20)),
    source_url: str(c.source_url, 1000) || null,
    google_place_id: str(c.google_place_id, 200) || null,
    google_rating: null,
    google_rating_count: null,
    google_maps_uri: null,
    // 置 null：upsertPlaces 的自动丰富会去查 Google 并回填
    website_uri: null,
    lat: num(c.lat),
    lng: num(c.lng),
  };
}

export const POST = mobileRoute(async ({ req, scope }) => {
  const body = await readJsonBody<Body>(req);
  const listId = str(body.list_id, 64);
  if (!listId) return jsonError("请选择要添加到的清单");

  const raw = Array.isArray(body.candidates) ? body.candidates : [];
  const candidates: UpsertCandidate[] = [];
  for (const item of raw.slice(0, 20)) {
    const c = toCandidate(item, listId);
    if (c) candidates.push(c);
  }
  if (candidates.length === 0) {
    return jsonError("没有可保存的店：店名、地址、类型标签都不能为空");
  }

  const r = await saveCandidatesToList(
    scope.supabase,
    scope.user.id,
    listId,
    candidates,
    { overrideMyReason: body.override_my_reason === true },
  );
  if (r.error) return jsonError(`保存失败：${r.error}`, 422);
  return jsonOk({ inserted: r.inserted, updated: r.updated });
});
