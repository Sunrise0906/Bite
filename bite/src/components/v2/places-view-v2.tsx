"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Place, PlacePrice, PlaceStatus } from "@/lib/db/types";
import { relDate } from "@/lib/util/rel-date";
import { menuSearchUrl } from "@/lib/places/menu-url";
import type { VisitSignal } from "@/lib/visits/aggregate";
import { StatusQuickToggle } from "@/components/places/status-quick-toggle";

const STATUS_ORDER: PlaceStatus[] = ["want_to_go", "visited", "archived"];
const PRICE_ORDER: PlacePrice[] = ["$", "$$", "$$$", "$$$$"];
const PRICE_LABEL: Record<PlacePrice, string> = {
  $: "$ · <$15",
  $$: "$$ · $15-30",
  $$$: "$$$ · $30-60",
  $$$$: "$$$$ · >$60",
};
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
  canEdit = true,
  visitsByPlace = {},
  reasonAuthors = {},
}: {
  listId: string;
  places: Place[];
  currentUserId: string;
  /** viewer 看到的是静态状态 chip，没有切换控件（DB 侧 RLS 也会拒） */
  canEdit?: boolean;
  visitsByPlace?: Record<string, VisitSignal>;
  /** user_id → 显示名。共享清单里别人写的理由要标出是谁写的 */
  reasonAuthors?: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PlaceStatus>("all");
  const [cuisineSel, setCuisineSel] = useState<Set<string>>(() => new Set());
  const [priceSel, setPriceSel] = useState<Set<PlacePrice>>(() => new Set());

  const { statusCounts, cuisines, prices } = useMemo(() => {
    const sc: Record<PlaceStatus, number> = {
      want_to_go: 0,
      visited: 0,
      archived: 0,
    };
    const cc = new Map<string, number>();
    const pc = new Map<PlacePrice, number>();
    for (const p of places) {
      sc[p.status] = (sc[p.status] ?? 0) + 1;
      for (const c of p.cuisine) cc.set(c, (cc.get(c) ?? 0) + 1);
      if (p.price_range) pc.set(p.price_range, (pc.get(p.price_range) ?? 0) + 1);
    }
    return {
      statusCounts: sc,
      cuisines: [...cc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      // 保持 $ → $$$$ 的固定顺序（不按频次排），只显示实际有店的档位
      prices: PRICE_ORDER.filter((p) => (pc.get(p) ?? 0) > 0).map(
        (p) => [p, pc.get(p)!] as const,
      ),
    };
  }, [places]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return places.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (cuisineSel.size > 0 && !p.cuisine.some((c) => cuisineSel.has(c)))
        return false;
      if (priceSel.size > 0) {
        if (!p.price_range || !priceSel.has(p.price_range)) return false;
      }
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
  }, [places, search, statusFilter, cuisineSel, priceSel]);

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

  const togglePrice = (p: PlacePrice) =>
    setPriceSel((prev) => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter !== "all" ||
    cuisineSel.size > 0 ||
    priceSel.size > 0;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCuisineSel(new Set());
    setPriceSel(new Set());
  };

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
        <div className="v2-filters">
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

      {(prices.length > 0 || hasFilters) && (
        <div className="v2-filters" style={{ marginBottom: 16 }}>
          {prices.map(([p, n]) => (
            <button
              key={p}
              type="button"
              className={`v2-fchip${priceSel.has(p) ? " on" : ""}`}
              onClick={() => togglePrice(p)}
              title={PRICE_LABEL[p]}
            >
              {p} {n}
            </button>
          ))}
          {hasFilters && (
            <button type="button" className="v2-fchip" onClick={clearFilters}>
              清除筛选
            </button>
          )}
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
              <div className="v2-plist">
                {items.map((p) => (
                  <PlaceCardV2
                    key={p.id}
                    listId={listId}
                    place={p}
                    currentUserId={currentUserId}
                    canEdit={canEdit}
                    visit={visitsByPlace[p.id] ?? null}
                    reasonAuthors={reasonAuthors}
                  />
                ))}
              </div>
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
  canEdit,
  visit,
  reasonAuthors,
}: {
  listId: string;
  place: Place;
  currentUserId: string;
  canEdit: boolean;
  visit: VisitSignal | null;
  reasonAuthors: Record<string, string>;
}) {
  const photo = place.photo_urls?.[0] ?? null;
  // 共享清单里理由是多人各写一条。优先显示自己的；没有自己的就显示别人的，
  // 并标出作者 —— 否则在共享清单上根本看不出「这句是谁写的」。
  const myReason = place.reasons.find((r) => r.user_id === currentUserId);
  const otherReason = place.reasons.find((r) => r.user_id !== currentUserId);
  const shown = myReason ?? otherReason ?? null;
  const reason = shown?.text ?? null;
  const reasonAuthor =
    shown && shown.user_id !== currentUserId
      ? (reasonAuthors[shown.user_id] ?? null)
      : null;
  const meta = [place.cuisine[0], place.price_range, place.address]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="v2-pcard">
      <Link
        href={`/lists/${listId}/places/${place.id}`}
        className="pcard-main"
      >
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
          {/* 可编辑时状态 chip 移到卡片右侧的操作区（见 Link 之后），
              这里只在只读时显示静态 chip —— 交互控件不能嵌在 <Link> 里。 */}
          {!canEdit && (
            <span
              className={`v2-pill ${STATUS_PILL[place.status]}`}
              style={{ padding: "2px 7px", flex: "none" }}
            >
              {STATUS_LABEL[place.status]}
            </span>
          )}
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
        {reason && (
          <div className="reason">
            {reasonAuthor && (
              <span style={{ opacity: 0.7 }}>@{reasonAuthor}：</span>
            )}
            {reason}
          </div>
        )}
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
      {canEdit && (
        <div className="pcard-status">
          <StatusQuickToggle
            placeId={place.id}
            listId={listId}
            currentStatus={place.status}
            chipClass={`v2-pill ${STATUS_PILL[place.status]}`}
          />
        </div>
      )}
      <a
        className="pcard-menu"
        href={menuSearchUrl(place.name, place.address)}
        target="_blank"
        rel="noreferrer"
        aria-label={`看 ${place.name} 的菜单`}
        onClick={(e) => e.stopPropagation()}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 3h11a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2z" />
          <path d="M8 7h6M8 11h6M8 15h4" />
        </svg>
        菜单
      </a>
    </div>
  );
}
