"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  IRVINE_FALLBACK,
  formatDistance,
  sortByDistance,
  boundsFor,
  nearbyPoints,
  type LatLng,
} from "@/lib/places/distance";
import { menuUrl } from "@/lib/places/menu-url";
import type { PlaceStatus } from "@/lib/db/types";

// 「附近去哪」。
//
// 旧版地图只是把所有店画成彩色圆点，点开弹个气泡（链接还指向编辑页）——
// 它不回答任何问题。而这个 app 每一屏都在回答「今晚去哪」：主页决策中枢、
// 想去 deck、一起选、聊天、清单页筛选，唯独地图不回答。
//
// 现在：定位 → 按距离升序 → 地图 + 下方可点的距离列表。地图是**辅助**，
// 真正做决定的是那个列表（「0.8 mi · 想去 · ★4.6」比一屏圆点有用得多）。

export type NearbyPlace = {
  id: string;
  list_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  status: PlaceStatus;
  cuisine: string[];
  price_range: string | null;
  google_rating: number | null;
  website_uri: string | null;
};

const STATUS_LABEL: Record<PlaceStatus, string> = {
  want_to_go: "想去",
  visited: "去过",
  archived: "归档",
};
const STATUS_COLOR: Record<PlaceStatus, string> = {
  want_to_go: "#b8862f",
  visited: "#5f7155",
  archived: "#a89c84",
};

type Geo = { origin: LatLng; real: boolean } | null;

export function NearbyView({
  places,
  apiKey,
}: {
  places: NearbyPlace[];
  apiKey: string;
}) {
  const [geo, setGeo] = useState<Geo>(null);
  // 挂载后立刻就会问定位，所以初值直接是 asking —— 不需要 idle，
  // 也省掉一次「在 effect 里同步 setState」（React 19 的 lint 会拦）
  const [geoState, setGeoState] = useState<"asking" | "done" | "denied">("asking");
  const [statusFilter, setStatusFilter] = useState<"all" | PlaceStatus>(
    "want_to_go",
  );
  const [cuisineSel, setCuisineSel] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 仓库没装 @types/google.maps（也不值得为这一个页面加个依赖）——
  // 用 any 逃生舱，和被这个组件取代的旧 places-map.tsx 一样。
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObj = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markers = useRef<Map<string, any>>(new Map());
  // 「我的位置」蓝点单独存：不存的话每次重画都会再 new 一个，蓝点越叠越多
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meMarker = useRef<any>(null);
  // 上次 fitBounds 用的点集签名。只有点集真的变了才重新框视野 ——
  // 否则点一下 marker（activeId 变）就把用户刚 pan 过去的视野拽回来。
  const fitted = useRef<string>("");

  // ---- 定位 ----
  useEffect(() => {
    // 拒绝 / 超时 / 浏览器没有这个 API → 回退尔湾中心（与 quick-add 一致）。
    // 页面仍然可用，只是「附近」是相对尔湾而不是相对你 —— 必须**说出来**，
    // 否则用户会以为那些距离是准的。
    const fallback = () => {
      setGeo({ origin: IRVINE_FALLBACK, real: false });
      setGeoState("denied");
    };
    if (!("geolocation" in navigator)) {
      queueMicrotask(fallback);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          origin: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          real: true,
        });
        setGeoState("done");
      },
      fallback,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  const cuisines = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of places)
      for (const x of p.cuisine) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [places]);

  const ranked = useMemo(() => {
    const filtered = places.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (cuisineSel && !p.cuisine.includes(cuisineSel)) return false;
      return true;
    });
    if (!geo) return filtered.map((p) => ({ ...p, distanceMi: null }));
    return sortByDistance(filtered, geo.origin);
  }, [places, statusFilter, cuisineSel, geo]);

  // ---- 地图 ----
  useEffect(() => {
    if (!apiKey || !mapRef.current) return;
    let cancelled = false;

    const init = () => {
      if (cancelled || !mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (!g?.maps) return;
      const map =
        mapObj.current ??
        new g.maps.Map(mapRef.current, {
          center: geo?.origin ?? IRVINE_FALLBACK,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
      mapObj.current = map;

      // 重画 marker（全部都画；只有**取景**才限制在附近那一簇）
      markers.current.forEach((m) => m.setMap(null));
      markers.current.clear();
      for (const p of ranked) {
        if (p.lat == null || p.lng == null) continue;
        const pos = { lat: p.lat, lng: p.lng };
        const marker = new g.maps.Marker({
          position: pos,
          map,
          title: p.name,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: p.id === activeId ? 11 : 8,
            fillColor: STATUS_COLOR[p.status],
            fillOpacity: 0.92,
            strokeColor: "#fff",
            strokeWeight: p.id === activeId ? 3 : 2,
          },
        });
        marker.addListener("click", () => setActiveId(p.id));
        markers.current.set(p.id, marker);
      }

      // 取景只看附近那一簇：有一家店坐标错到别的国家也不该把视野撑成世界地图
      const pts: LatLng[] = nearbyPoints(ranked);

      // 我的位置：单独一个蓝点
      meMarker.current?.setMap(null);
      meMarker.current = null;
      if (geo?.real) {
        meMarker.current = new g.maps.Marker({
          position: geo.origin,
          map,
          title: "我的位置",
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#1a73e8",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 3,
          },
          zIndex: 999,
        });
        pts.push(geo.origin);
      }

      const key = pts.map((p) => `${p.lat},${p.lng}`).join("|");
      const b = boundsFor(pts);
      if (b && key !== fitted.current) {
        fitted.current = key;
        map.fitBounds(
          new g.maps.LatLngBounds(
            new g.maps.LatLng(b.sw.lat, b.sw.lng),
            new g.maps.LatLng(b.ne.lat, b.ne.lng),
          ),
          48,
        );
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps) {
      init();
    } else {
      const existing = document.getElementById("gmaps-js");
      if (existing) {
        existing.addEventListener("load", init, { once: true });
      } else {
        const s = document.createElement("script");
        s.id = "gmaps-js";
        s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&language=zh-CN`;
        s.async = true;
        s.addEventListener("load", init, { once: true });
        document.head.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [apiKey, ranked, geo, activeId]);

  // 点列表项时把地图挪过去
  const focus = (p: NearbyPlace) => {
    setActiveId(p.id);
    if (p.lat != null && p.lng != null && mapObj.current) {
      mapObj.current.panTo({ lat: p.lat, lng: p.lng });
      if ((mapObj.current.getZoom() ?? 12) < 14) mapObj.current.setZoom(14);
    }
  };

  return (
    <div>
      {/* 定位状态：必须说清「附近」是相对谁 */}
      <div className="v2-nearby-geo">
        {geoState === "asking" && <span>正在定位…</span>}
        {geoState === "done" && <span>已按离你的距离排序</span>}
        {geoState === "denied" && (
          <span className="warn">
            没拿到定位权限，下面按「离尔湾市中心」的距离排 —— 不是离你
          </span>
        )}
      </div>

      <div className="v2-filters">
        {(["want_to_go", "visited", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`v2-fchip${statusFilter === s ? " on" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "全部" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {cuisines.length > 0 && (
        <div className="v2-filters" style={{ marginBottom: 12 }}>
          {cuisines.map(([c, n]) => (
            <button
              key={c}
              type="button"
              className={`v2-fchip${cuisineSel === c ? " on" : ""}`}
              onClick={() => setCuisineSel((v) => (v === c ? null : c))}
            >
              {c} {n}
            </button>
          ))}
        </div>
      )}

      <div ref={mapRef} className="v2-nearby-map" />

      {ranked.length === 0 ? (
        <div className="v2-empty" style={{ marginTop: 14 }}>
          <div className="t">没有符合条件的店</div>
          <div className="s">换个状态或菜系试试</div>
        </div>
      ) : (
        <ol className="v2-nearby-list">
          {ranked.map((p, i) => (
            <li
              key={p.id}
              className={`v2-nearby-row${p.id === activeId ? " on" : ""}`}
            >
              <button type="button" className="pin" onClick={() => focus(p)}>
                <span style={{ color: STATUS_COLOR[p.status] }}>●</span>
                <b>{i + 1}</b>
              </button>
              <Link href={`/lists/${p.list_id}/places/${p.id}`} className="body">
                <div className="nm">{p.name}</div>
                <div className="mt">
                  {p.distanceMi != null && (
                    <b className="dist">{formatDistance(p.distanceMi)}</b>
                  )}
                  {p.cuisine[0] && <span>· {p.cuisine[0]}</span>}
                  {p.price_range && <span>· {p.price_range}</span>}
                  {p.google_rating != null && (
                    <span className="star">· ★{p.google_rating.toFixed(1)}</span>
                  )}
                </div>
              </Link>
              <a
                className="menu"
                href={menuUrl(p.name, p.address, p.website_uri)}
                target="_blank"
                rel="noreferrer"
              >
                菜单
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
