// 「快捷评价」的档位表 —— 全应用唯一的一份。
//
// 五个梗词：夯 > 顶级 > 人上人 > NPC > 拉完了。
//
// ⚠️⚠️ 极性陷阱：这里 **1 是最好**（夯），5 是最差（拉完了）。
// 而同一个库里的 `visit_logs.star_rating` 是 **5 最好**。两个 1-5 的标度方向相反，
// 迟早会有人（包括未来的我）顺手写出 `Math.max(...)` 当「最好」。所以：
//   - 比较一律走 isBetterTier / bestTier，别直接比数字
//   - 展示一律走 tierMeta，别在组件里另抄一份 label 数组
//   - tier.test.ts 有一条断言专门钉住这个方向，改坏了会红
//
// 词是网络梗，随时可能过时。改词只改这个文件的 label / blurb 就够了 ——
// 存进 DB 的是序号，不需要 migration（这也是 sql/0028 用 smallint 而不是 enum 的原因）。

export type PlaceTier = 1 | 2 | 3 | 4 | 5;

export type TierMeta = {
  tier: PlaceTier;
  /** 主标签，卡片上的 chip 就显示这个 */
  label: string;
  /** 选择器里的一行小字，说明这一档大概什么意思 */
  blurb: string;
  /** v2.css 里的配色 class（沿用主题 token，4 套皮肤自动跟随） */
  pillClass: string;
};

/** 从最好到最差。数组顺序 = 展示顺序 = tier 升序，三者必须一致（见 test）。 */
export const TIERS: readonly TierMeta[] = [
  { tier: 1, label: "夯", blurb: "封神，逢人就安利", pillClass: "v2-tier-1" },
  { tier: 2, label: "顶级", blurb: "很能打，会专门再来", pillClass: "v2-tier-2" },
  { tier: 3, label: "人上人", blurb: "比大多数强，路过会进", pillClass: "v2-tier-3" },
  { tier: 4, label: "NPC", blurb: "没记忆点，可去可不去", pillClass: "v2-tier-4" },
  { tier: 5, label: "拉完了", blurb: "别去了", pillClass: "v2-tier-5" },
] as const;

export const BEST_TIER: PlaceTier = 1;
export const WORST_TIER: PlaceTier = 5;

export function isPlaceTier(v: unknown): v is PlaceTier {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

/** 兜底给「人上人」而不是抛错：DB 里真出现越界值时页面不该整个炸掉。 */
export function tierMeta(tier: PlaceTier): TierMeta {
  return TIERS.find((t) => t.tier === tier) ?? TIERS[2];
}

export function tierLabel(tier: PlaceTier): string {
  return tierMeta(tier).label;
}

/**
 * 把表单 / RPC 传来的任意值解析成档位。解析不出来 = null（表示「没评过」），
 * 调用方据此决定是清除还是不动。
 *
 * 接受 number 和数字字符串；空串 / null / undefined / 越界 / 小数一律 null。
 */
export function parseTier(raw: unknown): PlaceTier | null {
  if (raw == null) return null;
  if (typeof raw === "number") return isPlaceTier(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && isPlaceTier(n) ? n : null;
}

/**
 * a 是不是比 b 更好。**数值更小 = 更好**，所以这里是 `<` 而不是 `>`。
 * 这个函数存在的唯一理由就是别让调用点自己写这个方向。
 */
export function isBetterTier(a: PlaceTier, b: PlaceTier): boolean {
  return a < b;
}

/** 一组档位里最好的那个（空数组 → null）。同样：最好 = 数值最小。 */
export function bestTier(tiers: readonly PlaceTier[]): PlaceTier | null {
  let best: PlaceTier | null = null;
  for (const t of tiers) {
    if (best === null || isBetterTier(t, best)) best = t;
  }
  return best;
}

// ============================ 聚合 ============================

export type TierRow = { user_id: string; tier: PlaceTier };

export type TierSummary = {
  /** 当前用户自己评的（没评过 = null） */
  mine: PlaceTier | null;
  /** 别人评的，按档位从好到差排 */
  others: readonly TierRow[];
  /** 全部人里最好的一档（含自己）。清单卡片上「这店最高被评到几档」用它 */
  best: PlaceTier | null;
  /** 总共几个人评过（含自己） */
  count: number;
};

export const EMPTY_TIER_SUMMARY: TierSummary = {
  mine: null,
  others: [],
  best: null,
  count: 0,
};

/**
 * 把一家店的原始评价行折成展示用的摘要。
 *
 * 共享清单里每人各评各的（口径同 places.reasons），所以「这家店几档」没有单一答案 ——
 * UI 显示的是「我的档位」+「别人怎么看」，而不是求平均。求平均会把
 * 「一个人说夯、一个人说拉完了」抹成「人上人」，那是最没信息量的一档。
 */
export function summarizeTiers(
  rows: readonly TierRow[],
  currentUserId: string,
): TierSummary {
  let mine: PlaceTier | null = null;
  const others: TierRow[] = [];
  for (const r of rows) {
    if (!isPlaceTier(r.tier)) continue;
    if (r.user_id === currentUserId) mine = r.tier;
    else others.push(r);
  }
  others.sort((a, b) => a.tier - b.tier); // 升序 = 从好到差
  const all = others.map((r) => r.tier);
  if (mine !== null) all.push(mine);
  return {
    mine,
    others,
    best: bestTier(all),
    count: all.length,
  };
}
