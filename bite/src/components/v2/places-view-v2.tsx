"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Place, PlaceStatus } from "@/lib/db/types";
import { relDate } from "@/lib/util/rel-date";
import type { PlaceVisitSummary } from "@/components/places/places-view";

const STATUS_ORDER: PlaceStatus[] = ["want_to_go", "visited", "archived"];
const STATUS_LABEL: Record<PlaceStatus, string> = {
  want_to_go: "想去",
  visited: "去过",
  archived: "归档",
};
const STATUS_PILL: Record<PlaceStatus, string> = {
  want_to_go: "v2-pill-want",
  visited: "v2-pill-visited",
  archived: "v2-pill-visited",
};
const SENTIMENT: Record<string, string> = {
  will_return: "会再来",
  okay: "还行",
  wont_return: "不会再来",
};

export function PlacesViewV2({
  listId,
  places,
  currentUserId,
  visitsByPlace = {},
}: {
  listId: string;
  places: Place[];
  currentUserId: string;
  visitsByPlace?: Record<string, PlaceVisitSummary>;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PlaceStatus>("all");
  const [cuisineSel, setCuisineSel] = useState<Set<string>>(() => new Set());

  const { statusCounts, cuisines } = useMemo(() => {
    const sc: Record<PlaceStatus, number> = {
      want_to_go: 0,
      visited: 0,
      archived: 0,
    };
    const cc = new Map<string, number>();
    for (const p of places) {
      sc[p.status] = (sc[p.status] ?? 0) + 1;
      for (const c of p.cuisine) cc.set(c, (cc.get(c) ?? 0) + 1);
    }
    return {
      statusCounts: sc,
      cuisines: [...cc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [places]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return places.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (cuisineSel.size > 0 && !p.cuisine.some((c) => cuisineSel.has(c)))
        return false;
      if (q) {
        const hay = [
          p.name,
          p.address,
          p.notes ?? "",
          ...p.cuisine,
          ...p.tags,
          ...p.reasons.map((r) => r.text),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [places, search, statusFilter, cuisineSel]);

  const grouped = useMemo(() => {
    const m = new Map<PlaceStatus, Place[]>();
    for (const s of STATUS_ORDER) m.set(s, []);
    for (const p of filtered) m.get(p.status)?.push(p);
    return m;
  }, [filtered]);

  const toggleCuisine = (c: string) =>
    setCuisineSel((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  return (
    <div>
      <div className="v2-search">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          className="field-input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜店名 / 菜系 / 备注…"
        />
      </div>

      <div className="v2-filters">
        <button
          type="button"
          className={`v2-fchip${statusFilter === "all" ? " on" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          全部 {places.length}
        </button>
        {STATUS_ORDER.filter((s) => statusCounts[s] > 0).map((s) => (
          <button
            key={s}
            type="button"
            className={`v2-fchip${statusFilter === s ? " on" : ""}`}
            onClick={() => setStatusFilter((p) => (p === s ? "all" : s))}
          >
            {STATUS_LABEL[s]} {statusCounts[s]}
          </button>
        ))}
      </div>

      {cuisines.length > 0 && (
        <div className="v2-filters" style={{ marginBottom: 16 }}>
          {cuisines.map(([c, n]) => (
            <button
              key={c}
              type="button"
              className={`v2-fchip${cuisineSel.has(c) ? " on" : ""}`}
              onClick={() => toggleCuisine(c)}
            >
              {c} {n}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="v2-empty">
          <div className="t">没有匹配的店</div>
          <div className="s">试试换个关键词或清掉筛选</div>
        </div>
      ) : (
        STATUS_ORDER.map((status) => {
          const items = grouped.get(status) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={status} style={{ marginBottom: 22 }}>
              <div className="v2-sec">
                <h3>
                  {STATUS_LABEL[status]}
                  <span className="v2-faint" style={{ fontWeight: 400, marginLeft: 8 }}>
                    {items.length}
                  </span>
                </h3>
              </div>
              {items.map((p) => (
                <PlaceCardV2
                  key={p.id}
                  listId={listId}
                  place={p}
                  currentUserId={currentUserId}
                  visit={visitsByPlace[p.id] ?? null}
                />
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}

function PlaceCardV2({
  listId,
  place,
  currentUserId,
  visit,
}: {
  listId: string;
  place: Place;
  currentUserId: string;
  visit: PlaceVisitSummary | null;
}) {
  const photo = place.photo_urls?.[0] ?? null;
  const myReason = place.reasons.find((r) => r.user_id === currentUserId)?.text;
  const reason = myReason ?? place.reasons[0]?.text ?? null;
  const meta = [place.cuisine[0], place.price_range, place.address]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/lists/${listId}/places/${place.id}`} className="v2-pcard">
      <div
        className="cover"
        style={photo ? { backgroundImage: `url('${photo}')` } : undefined}
      >
        {!photo && (
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 3v7a2 2 0 0 1-2 2M3 3v7a2 2 0 0 0 2 2m0 0v9M17 3c-1.7 0-3 2.2-3 5s1.3 5 3 5m0-10v18m0-8c1.7 0 3-2.2 3-5s-1.3-5-3-5" />
          </svg>
        )}
      </div>
      <div className="info">
        <div className="nm">
          <span className="t">{place.name}</span>
          <span
            className={`v2-pill ${STATUS_PILL[place.status]}`}
            style={{ padding: "2px 7px", flex: "none" }}
          >
            {STATUS_LABEL[place.status]}
          </span>
        </div>
        {meta && (
          <div className="meta">
            {meta}
            {place.google_rating != null && (
              <span style={{ color: "var(--v2-gold)", fontWeight: 600 }}>
                {"  ·  ★"}
                {place.google_rating.toFixed(1)}
              </span>
            )}
          </div>
        )}
        {reason && <div className="reason">{reason}</div>}
        {visit && visit.count > 0 && (
          <div className="signal">
            去过 {visit.count} 次
            <span>· {relDate(visit.last_visit)}</span>
            {visit.last_sentiment && SENTIMENT[visit.last_sentiment] && (
              <span>· {SENTIMENT[visit.last_sentiment]}</span>
            )}
            {visit.avg_star != null && (
              <span className="star">★{visit.avg_star.toFixed(1)}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
