"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DeckItem } from "./home-v2";

/** 想去 deck + 真实菜系筛选 chips（客户端过滤） */
export function DeckSection({
  deck,
  totalWant,
}: {
  deck: DeckItem[];
  totalWant: number;
}) {
  // 从候选里取出现频次最高的菜系做筛选项
  const cuisines = useMemo(() => {
    const count = new Map<string, number>();
    for (const d of deck)
      for (const c of d.cuisine) count.set(c, (count.get(c) ?? 0) + 1);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => c);
  }, [deck]);

  const [active, setActive] = useState<string | null>(null);
  const filtered = active
    ? deck.filter((d) => d.cuisine.includes(active))
    : deck;

  return (
    <>
      <div className="v2-sec">
        <h3>想去 · 帮你前置了</h3>
        <span className="more">{totalWant} 家</span>
      </div>

      {cuisines.length > 0 && (
        <div className="v2-filters">
          <button
            type="button"
            className={`v2-fchip${active === null ? " on" : ""}`}
            onClick={() => setActive(null)}
          >
            全部
          </button>
          {cuisines.map((c) => (
            <button
              key={c}
              type="button"
              className={`v2-fchip${active === c ? " on" : ""}`}
              onClick={() => setActive((p) => (p === c ? null : c))}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="v2-deck">
        {filtered.map((d) => (
          <Link
            key={d.placeId}
            href={`/lists/${d.listId}/places/${d.placeId}`}
            className="v2-dcard"
          >
            <div
              className="img"
              style={d.photo ? { backgroundImage: `url('${d.photo}')` } : undefined}
            />
            <div className="b">
              <div className="nm">{d.name}</div>
              <div className="mt">
                {[d.cuisine[0], d.price].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="why">{d.reason ? `"${d.reason}"` : " "}</div>
              <div className="act">
                <div className="b1">就它</div>
                <div className="b2">
                  <svg className="v2-svg" width="14" height="14" viewBox="0 0 24 24">
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
