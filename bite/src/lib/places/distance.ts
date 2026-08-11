// 「离我多远」的纯计算。无 I/O、无浏览器 API，可单测。
//
// 地图页此前只是把所有店画成点，不回答任何问题 —— 而这个 app 每一屏都在回答
// 「今晚去哪」。位置感知是交接文档路线图的第 1 条，坐标（25 家里 24 家有）
// 和浏览器定位（quick-add 已在用）都是现成的，缺的就是这一层。

export type LatLng = { lat: number; lng: number };

/** 浏览器定位失败时的兜底中心，与 quick-add-input.tsx 保持一致（尔湾市中心） */
export const IRVINE_FALLBACK: LatLng = { lat: 33.6846, lng: -117.8265 };

const EARTH_RADIUS_MI = 3958.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * 两点间大圆距离（英里）。
 * 用户在南加，看英里比公里自然（Google/Yelp 也都是 mi）。
 */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 距离的展示文案。
 * 近距离给一位小数（0.3 mi 和 0.8 mi 是不同的决策），远了就取整 ——
 * 「12.4 mi」的那个 .4 对「今晚去哪」毫无意义。
 */
export function formatDistance(mi: number): string {
  if (!Number.isFinite(mi) || mi < 0) return "";
  if (mi < 0.1) return "就在附近";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

export type WithCoords = { lat: number | null; lng: number | null };

/**
 * 按离 origin 的距离升序排。**没有坐标的排在最后**（而不是当成距离 0 冒到最前）。
 * 返回新数组，不改入参。
 */
export function sortByDistance<T extends WithCoords>(
  items: readonly T[],
  origin: LatLng,
): Array<T & { distanceMi: number | null }> {
  return items
    .map((it) => ({
      ...it,
      distanceMi:
        it.lat != null && it.lng != null
          ? distanceMiles(origin, { lat: it.lat, lng: it.lng })
          : null,
    }))
    .sort((a, b) => {
      if (a.distanceMi == null && b.distanceMi == null) return 0;
      if (a.distanceMi == null) return 1; // 无坐标沉底
      if (b.distanceMi == null) return -1;
      return a.distanceMi - b.distanceMi;
    });
}

/**
 * 一堆坐标的中位数中心 = 「这个用户的店大体在哪」。
 *
 * 用中位数而不是平均数：只要有一个点错到别的大洲，平均值就会被整个拽跑，
 * 而中位数纹丝不动 —— 我们正是要拿它当基准把那种点认出来。
 */
export function medianCenter(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const mid = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const i = s.length >> 1;
    return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
  };
  return { lat: mid(points.map((p) => p.lat)), lng: mid(points.map((p) => p.lng)) };
}

/**
 * 挑出「附近那一簇」的坐标，给 fitBounds 用。
 *
 * 直接拿全部点去 fitBounds 有个致命弱点：只要**一家**店的坐标是错的
 * （真实案例：New Duong Son BBQ 的 place_id 和评分都指向 Westminster CA，
 * 坐标却落在越南），视野就会被撑成整张世界地图，整个页面作废。
 * 而这一屏叫「附近去哪」—— 本来就只需要框住近处。
 *
 * 入参需已按距离升序（即 sortByDistance 的输出）。半径内不足 minCount 家时，
 * 直接取最近的 minCount 家，保证郊区用户不会开局看到一个空框。
 */
export function nearbyPoints(
  sorted: readonly { lat: number | null; lng: number | null; distanceMi: number | null }[],
  radiusMi = 25,
  minCount = 5,
): LatLng[] {
  const withCoords = sorted.filter(
    (p): p is { lat: number; lng: number; distanceMi: number | null } =>
      p.lat != null && p.lng != null,
  );
  const near = withCoords.filter(
    (p) => p.distanceMi != null && p.distanceMi <= radiusMi,
  );
  const picked = near.length >= minCount ? near : withCoords.slice(0, minCount);
  return picked.map((p) => ({ lat: p.lat, lng: p.lng }));
}

/** 让所有点都进视野的地图边界；只有一个点时给个合理的默认缩放范围。 */
export function boundsFor(points: readonly LatLng[]): {
  sw: LatLng;
  ne: LatLng;
} | null {
  if (points.length === 0) return null;
  let minLat = points[0].lat, maxLat = points[0].lat;
  let minLng = points[0].lng, maxLng = points[0].lng;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  // 单点（或所有点重合）时 fitBounds 会缩到最大级别，看着像坏了 —— 撑开一点
  if (maxLat - minLat < 0.005 && maxLng - minLng < 0.005) {
    const pad = 0.01;
    return {
      sw: { lat: minLat - pad, lng: minLng - pad },
      ne: { lat: maxLat + pad, lng: maxLng + pad },
    };
  }
  return { sw: { lat: minLat, lng: minLng }, ne: { lat: maxLat, lng: maxLng } };
}
