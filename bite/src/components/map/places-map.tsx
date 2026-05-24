"use client";

import { useEffect, useRef } from "react";

type MapPlace = {
  id: string;
  list_id: string;
  name: string;
  lat: number;
  lng: number;
  status: "want_to_go" | "visited" | "archived";
  has_visited?: boolean;
};

const STATUS_COLOR: Record<MapPlace["status"], string> = {
  want_to_go: "#D97757", // terracotta (主色)
  visited: "#10b981", // emerald
  archived: "#9ca3af",
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
            fillColor: STATUS_COLOR[p.status],
            fillOpacity: 0.9,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => {
          const link = `/lists/${p.list_id}/places/${p.id}/edit`;
          infoWindow.setContent(`
            <div style="padding:4px 6px; min-width:160px;">
              <div style="font-weight:600; color:#1f2937;">${escapeHtml(p.name)}</div>
              <div style="margin-top:2px; font-size:11px; color:${STATUS_COLOR[p.status]};">● ${STATUS_LABEL[p.status]}</div>
              <a href="${link}" style="display:inline-block; margin-top:4px; font-size:11px; color:#D97757; text-decoration:underline;">查看详情 ›</a>
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&language=zh-CN`;
    script.onload = init;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [places, apiKey]);

  if (places.length === 0) {
    return (
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        <p className="text-base font-medium text-[var(--text-strong)]">
          地图还是空的
        </p>
        <p className="mt-2 max-w-sm text-sm text-zinc-600">
          目前你的店都没有坐标。从 /quick-add 用 Google Places autocomplete 添加店时会自动带上 lat/lng。
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div ref={ref} className="h-[calc(100dvh-200px)] min-h-[400px] w-full" />
      <div className="border-t border-[var(--border-subtle)] px-4 py-2 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5 mr-3">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.want_to_go }} />
          想去
        </span>
        <span className="inline-flex items-center gap-1.5 mr-3">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.visited }} />
          已去过
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.archived }} />
          归档
        </span>
        <span className="ml-3 text-zinc-400">· 点击圆点看详情</span>
      </div>
    </div>
  );
}
