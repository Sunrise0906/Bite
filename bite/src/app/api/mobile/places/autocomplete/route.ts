// GET /api/mobile/places/autocomplete?input=…&lat=…&lng=…&session=…
// Google Places 店名补全，用服务端 key 代查（App 包里不放 Google key）。

import { jsonError, jsonOk, mobileRoute } from "@/lib/supabase/mobile-auth";
import { autocompletePlaces } from "@/lib/places/google";

export const runtime = "nodejs";

export const GET = mobileRoute(async ({ req }) => {
  const url = new URL(req.url);
  const input = (url.searchParams.get("input") ?? "").trim().slice(0, 120);
  if (input.length < 2) return jsonOk({ suggestions: [] });
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const origin =
    Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const session = url.searchParams.get("session")?.slice(0, 80) || undefined;
  try {
    const suggestions = await autocompletePlaces(input, origin, session);
    return jsonOk({
      suggestions: suggestions.map((s) => ({
        place_id: s.placeId,
        main_text: s.mainText,
        secondary_text: s.secondaryText,
        distance_meters: s.distanceMeters ?? null,
      })),
    });
  } catch (err) {
    return jsonError(
      "搜索失败：" + (err instanceof Error ? err.message : "Google Places 不可用"),
      502,
    );
  }
});
