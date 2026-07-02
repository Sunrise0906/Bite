"use client";

import { useEffect, useRef } from "react";
import { MapPinIcon } from "@/components/ui/icons";

type MapPlace = {
  id: string;
  list_id: string;
  name: string;
  lat: number;
  lng: number;
  status: "want_to_go" | "visited" | "archived";
  has_visited?: boolean;
};

// Maps JS marker 画在 canvas 上必须给具体色值。这是 V1/无主题的兜底；
// V2 下运行时从 .ui-v2 的 computed style 读 --v2-gold/--v2-sage/--v2-faint，
// marker 颜色跟随主题。InfoWindow 气泡是 Google 的白底，文字固定深色不主题化。
const STATUS_COLOR: Record<MapPlace["status"], string> = {
  want_to_go: "#b98a2f", // gold（想去）
  visited: "#5f7155", // sage（已去过）
  archived: "#a89c84", // 暖灰（归档）
};

const STATUS_VAR: Record<MapPlace["status"], string> = {
  want_to_go: "--v2-gold",
  visited: "--v2-sage",
  archived: "--v2-faint",
};

const STATUS_LABEL: Record<MapPlace["status"], string> = {
  want_to_go: "想去",
  visited: "已去过",
  archived: "归档",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function PlacesMap({
  places,
  apiKey,
}: {
  places: MapPlace[];
  apiKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || places.length === 0) return;
    let cancelled = false;

    const init = () => {
      if (cancelled || !ref.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (!g?.maps) return;

      // V2 主题下 marker 用当前主题的 token 色（pop 的鲜绿 / midnight 的金…）
      const themeEl = ref.current.closest(".ui-v2");
      const cs = themeEl ? getComputedStyle(themeEl) : null;
      const statusColor = (s: MapPlace["status"]): string =>
        cs?.getPropertyValue(STATUS_VAR[s]).trim() || STATUS_COLOR[s];

      const bounds = new g.maps.LatLngBounds();
      places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));

      const map = new g.maps.Map(ref.current, {
        center: bounds.getCenter(),
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
      });
      if (places.length > 1) {
        map.fitBounds(bounds, 40);
      }

      const infoWindow = new g.maps.InfoWindow();

      places.forEach((p) => {
        const marker = new g.maps.Marker({
          position: { lat: p.lat, lng: p.lng },
          map,
          title: p.name,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: statusColor(p.status),
            fillOpacity: 0.9,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => {
          const link = `/lists/${p.list_id}/places/${p.id}/edit`;
          infoWindow.setContent(`
            <div style="padding:4px 6px; min-width:160px;">
              <div style="font-weight:600; color:#1f1a14;">${escapeHtml(p.name)}</div>
              <div style="margin-top:2px; font-size:11px; color:#6b6253;"><span style="color:${statusColor(p.status)};">●</span> ${STATUS_LABEL[p.status]}</div>
              <a href="${link}" style="display:inline-block; margin-top:4px; font-size:11px; color:#9c4226; text-decoration:underline;">查看详情 ›</a>
            </div>
          `);
          infoWindow.open({ map, anchor: marker });
        });
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps) {
      init();
      return () => {
        cancelled = true;
      };
    }

    const scriptId = "google-maps-js";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", init);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", init);
      };
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    // 不加 loading=async：经典同步加载下 onload 时 google.maps.*（Map / LatLngBounds /
    // Marker / SymbolPath）已全部就绪，可直接 new。用 loading=async 则要走
    // importLibrary 异步取，onload 时经典构造器还没挂上 → "LatLngBounds is not a constructor"。
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&language=zh-CN`;
    script.onload = init;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [places, apiKey]);

  if (places.length === 0) {
    return (
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        <MapPinIcon size={32} className="mb-4 text-[var(--primary)]" />
        <p className="heading-display text-lg text-[var(--text-strong)]">
          地图还是空的
        </p>
        <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
          目前你的店都没有坐标。从 /quick-add 用 Google Places autocomplete 添加店时会自动带上 lat/lng。
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div ref={ref} className="h-[calc(100dvh-200px)] min-h-[400px] w-full" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border-subtle)] px-5 py-3 text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--gold)" }}
          />
          想去
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--sage)" }}
          />
          已去过
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--status-archived-dot)" }}
          />
          归档
        </span>
        <span className="text-[var(--text-faint)]">点击圆点看详情</span>
      </div>
    </div>
  );
}
