"use client";

import { useMemo, useState } from "react";
import type { Place, PlacePrice, PlaceStatus } from "@/lib/db/types";
import { SearchIcon } from "@/components/ui/icons";
import { PlaceCard } from "./place-card";

const STATUS_ORDER: PlaceStatus[] = ["want_to_go", "visited", "archived"];
const STATUS_LABEL: Record<PlaceStatus, string> = {
  want_to_go: "想去",
  visited: "已去过",
  archived: "归档",
};

const PRICE_ORDER: PlacePrice[] = ["$", "$$", "$$$", "$$$$"];
const PRICE_LABEL: Record<PlacePrice, string> = {
  $: "$ · <$15",
  $$: "$$ · $15-30",
  $$$: "$$$ · $30-60",
  $$$$: "$$$$ · >$60",
};

type StatusFilter = "all" | PlaceStatus;

export type PlaceVisitSummary = {
  count: number;
  last_visit: string;
  last_sentiment: "will_return" | "okay" | "wont_return";
  avg_star: number | null;
};

export function PlacesView({
  places,
  currentUserId,
  canEdit = true,
  visitsByPlace = {},
  reasonAuthors = {},
}: {
  places: Place[];
  currentUserId: string;
  canEdit?: boolean;
  visitsByPlace?: Record<string, PlaceVisitSummary>;
  /** user_id → display name，给 PlaceCard 显示别人的 reasons */
  reasonAuthors?: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cuisineFilter, setCuisineFilter] = useState<Set<string>>(
    () => new Set(),
  );
  const [priceFilter, setPriceFilter] = useState<Set<PlacePrice>>(
    () => new Set(),
  );

  // 统计：各 status 数量、每个菜系出现频次
  const counts = useMemo(() => {
    const status: Record<PlaceStatus, number> = {
      want_to_go: 0,
      visited: 0,
      archived: 0,
    };
    const cuisineCount = new Map<string, number>();
    for (const p of places) {
      status[p.status] = (status[p.status] ?? 0) + 1;
      for (const c of p.cuisine) {
        cuisineCount.set(c, (cuisineCount.get(c) ?? 0) + 1);
      }
    }
    const cuisines = Array.from(cuisineCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    return { status, cuisines };
  }, [places]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cuisinesSel = cuisineFilter;
    const pricesSel = priceFilter;

    return places.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (cuisinesSel.size > 0) {
        const has = p.cuisine.some((c) => cuisinesSel.has(c));
        if (!has) return false;
      }
      if (pricesSel.size > 0) {
        if (!p.price_range || !pricesSel.has(p.price_range)) return false;
      }
      if (q) {
        const fields: string[] = [
          p.name,
          p.address,
          p.recommended_by ?? "",
          p.notes ?? "",
          ...p.cuisine,
          ...p.tags,
          ...p.occasions,
          ...p.reasons.map((r) => r.text),
        ];
        const hay = fields.join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [places, search, statusFilter, cuisineFilter, priceFilter]);

  // 分组
  const grouped = useMemo(() => {
    const m = new Map<PlaceStatus, Place[]>();
    for (const s of STATUS_ORDER) m.set(s, []);
    for (const p of filtered) m.get(p.status)?.push(p);
    return m;
  }, [filtered]);

  const toggleCuisine = (c: string) => {
    setCuisineFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const togglePrice = (p: PlacePrice) => {
    setPriceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const hasAnyFilter =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    cuisineFilter.size > 0 ||
    priceFilter.size > 0;

  const clearAll = () => {
    setSearch("");
    setStatusFilter("all");
    setCuisineFilter(new Set());
    setPriceFilter(new Set());
  };

  if (places.length === 0) return null;

  return (
    <div>
      {/* 搜索框 */}
      <div className="mb-3">
        <div className="relative">
          <SearchIcon
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜店名 / 地址 / 菜系 / 备注…"
            className="field-input pl-10"
          />
        </div>
      </div>

      {/* 状态切换 */}
      <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
        <FilterPill
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        >
          全部 · {places.length}
        </FilterPill>
        {STATUS_ORDER.map((s) => (
          <FilterPill
            key={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          >
            {STATUS_LABEL[s]} · {counts.status[s]}
          </FilterPill>
        ))}
      </div>

      {/* 菜系（多选） */}
      {counts.cuisines.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 font-medium text-[var(--text-muted)]">菜系</span>
          {counts.cuisines.map(([c, n]) => (
            <FilterPill
              key={c}
              active={cuisineFilter.has(c)}
              onClick={() => toggleCuisine(c)}
            >
              {c} · {n}
            </FilterPill>
          ))}
        </div>
      )}

      {/* 价位（多选） */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 font-medium text-[var(--text-muted)]">价位</span>
        {PRICE_ORDER.map((p) => (
          <FilterPill
            key={p}
            active={priceFilter.has(p)}
            onClick={() => togglePrice(p)}
          >
            {PRICE_LABEL[p]}
          </FilterPill>
        ))}
        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-[var(--text-muted)] underline-offset-2 transition-colors hover:text-[var(--text-strong)] hover:underline"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* 结果 */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <p className="text-sm text-[var(--text-default)]">没有匹配的店</p>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            试试换个关键词或清除筛选
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {STATUS_ORDER.map((status) => {
            const items = grouped.get(status) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={status}>
                <div className="section-heading mb-3">
                  <h2 className="text-lg text-[var(--text-strong)]">
                    {STATUS_LABEL[status]}
                    <span className="ml-2 font-sans text-sm font-normal text-[var(--text-faint)]">
                      {items.length}
                    </span>
                  </h2>
                </div>
                <ul className="space-y-3">
                  {items.map((p) => (
                    <li key={p.id}>
                      <PlaceCard
                        place={p}
                        currentUserId={currentUserId}
                        canEdit={canEdit}
                        visitSummary={visitsByPlace[p.id] ?? null}
                        reasonAuthors={reasonAuthors}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-[var(--primary)] px-3 py-1.5 font-medium text-[var(--primary-foreground)] transition-colors"
          : "rounded-full border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-1.5 text-[var(--text-default)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
      }
    >
      {children}
    </button>
  );
}
