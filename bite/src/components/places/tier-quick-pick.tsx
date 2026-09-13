"use client";

import { useState, useTransition } from "react";
import { setPlaceTier } from "@/lib/actions/ratings";
import {
  TIERS,
  tierMeta,
  type PlaceTier,
  type TierSummary,
} from "@/lib/places/tier";

// 一键档位评价：夯 / 顶级 / 人上人 / NPC / 拉完了。
//
// 交互抄 StatusQuickToggle 的骨架（乐观更新 + 失败回滚 + 点外面关闭），
// 但**不要求 canEdit** —— viewer 也能评，口径同评论和一起选投票（sql/0028 的 RLS）。
//
// ⚠️ 这个组件会出现在清单卡片里，而卡片主体是个 <Link>。所以调用方必须把它放在
// Link **外面**（见 places-view-v2 的 pcard-status），并且这里所有点击都
// stopPropagation + preventDefault —— 否则点评价会顺带跳转到详情页。

export function TierQuickPick({
  placeId,
  summary,
  /** 别人的档位要不要一起显示（共享清单里有用，个人清单里是噪音） */
  showOthers = false,
  /** user_id → 显示名，showOthers 时用 */
  authors = {},
}: {
  placeId: string;
  summary: TierSummary;
  showOthers?: boolean;
  authors?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<PlaceTier | null>(summary.mine);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(next: PlaceTier | null) {
    setOpen(false);
    if (next === mine) return;
    const prev = mine;
    setMine(next); // 乐观
    setError(null);
    start(async () => {
      const r = await setPlaceTier(placeId, next);
      if ("error" in r) {
        setMine(prev); // 回滚
        setError(r.error);
      }
    });
  }

  const current = mine !== null ? tierMeta(mine) : null;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current ? `我的评价：${current.label}` : "给这家店评个档位"}
        title={current ? "点击改评价" : "点击评价"}
        className={`v2-tier ${current ? current.pillClass : "empty"}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {pending ? "…" : (current?.label ?? "评一下")}
      </button>

      {open && (
        <>
          {/* 点外面关闭。fixed 铺满，但 z 比弹层低 */}
          <div
            className="fixed inset-0 z-30"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            role="listbox"
            aria-label="档位"
            className="v2-tier-pop"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {TIERS.map((t) => (
              <button
                key={t.tier}
                type="button"
                role="option"
                aria-selected={mine === t.tier}
                className={mine === t.tier ? "on" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pick(t.tier);
                }}
              >
                <span className={`v2-tier ${t.pillClass}`} style={{ pointerEvents: "none" }}>
                  {t.label}
                </span>
                <span className="bl">{t.blurb}</span>
              </button>
            ))}
            {mine !== null && (
              <button
                type="button"
                className="clr"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pick(null);
                }}
              >
                撤销我的评价
              </button>
            )}
          </div>
        </>
      )}

      {showOthers && summary.others.length > 0 && (
        <div className="v2-tier-others" style={{ marginTop: 5 }}>
          {summary.others.map((o) => {
            const m = tierMeta(o.tier);
            return (
              <span key={o.user_id}>
                @{authors[o.user_id] ?? "朋友"}
                <span style={{ fontWeight: 700 }}> {m.label}</span>
              </span>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="v2-tier-others" style={{ marginTop: 5, color: "var(--v2-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
