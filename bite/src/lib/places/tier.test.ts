import { describe, expect, it } from "vitest";
import {
  BEST_TIER,
  TIERS,
  WORST_TIER,
  bestTier,
  isBetterTier,
  isPlaceTier,
  parseTier,
  summarizeTiers,
  tierLabel,
  tierMeta,
  type PlaceTier,
} from "./tier";

describe("极性（本文件存在的主要理由）", () => {
  // 同一个库里 visit_logs.star_rating 是 5 最好，这里是 1 最好。
  // 任何一次「顺手改成 max」都会被下面这几条抓住。
  it("1 是最好的一档，5 是最差的", () => {
    expect(BEST_TIER).toBe(1);
    expect(WORST_TIER).toBe(5);
    expect(tierLabel(BEST_TIER)).toBe("夯");
    expect(tierLabel(WORST_TIER)).toBe("拉完了");
  });

  it("isBetterTier：数值小的更好", () => {
    expect(isBetterTier(1, 5)).toBe(true);
    expect(isBetterTier(5, 1)).toBe(false);
    expect(isBetterTier(2, 3)).toBe(true);
    expect(isBetterTier(3, 3)).toBe(false); // 相等不算「更好」
  });

  it("bestTier 取的是最小值，不是最大值", () => {
    expect(bestTier([4, 2, 5])).toBe(2);
    expect(bestTier([5])).toBe(5);
    expect(bestTier([])).toBeNull();
  });
});

describe("TIERS 表", () => {
  it("正好 5 档，且顺序 = tier 升序 = 从好到差", () => {
    expect(TIERS).toHaveLength(5);
    expect(TIERS.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]);
  });

  it("就是用户要的那五个词", () => {
    expect(TIERS.map((t) => t.label)).toEqual([
      "夯",
      "顶级",
      "人上人",
      "NPC",
      "拉完了",
    ]);
  });

  it("每档都有独立的配色 class（不能撞，否则五档看起来一样）", () => {
    const classes = TIERS.map((t) => t.pillClass);
    expect(new Set(classes).size).toBe(5);
  });

  it("tierMeta 对越界值兜底而不是抛错", () => {
    expect(tierMeta(99 as PlaceTier).tier).toBe(3);
  });
});

describe("isPlaceTier", () => {
  it("只认 1..5 的整数", () => {
    expect(isPlaceTier(1)).toBe(true);
    expect(isPlaceTier(5)).toBe(true);
    expect(isPlaceTier(0)).toBe(false);
    expect(isPlaceTier(6)).toBe(false);
    expect(isPlaceTier(2.5)).toBe(false);
    expect(isPlaceTier("3")).toBe(false);
    expect(isPlaceTier(null)).toBe(false);
    expect(isPlaceTier(undefined)).toBe(false);
  });
});

describe("parseTier（表单里进来的都是字符串）", () => {
  it("接受数字和数字字符串", () => {
    expect(parseTier(3)).toBe(3);
    expect(parseTier("3")).toBe(3);
    expect(parseTier(" 4 ")).toBe(4);
  });

  it("「没评过」的各种写法都归成 null", () => {
    expect(parseTier("")).toBeNull();
    expect(parseTier("   ")).toBeNull();
    expect(parseTier(null)).toBeNull();
    expect(parseTier(undefined)).toBeNull();
  });

  it("越界 / 非整数 / 垃圾输入一律 null，不会写进库", () => {
    expect(parseTier(0)).toBeNull();
    expect(parseTier(6)).toBeNull();
    expect(parseTier("-1")).toBeNull();
    expect(parseTier("2.5")).toBeNull();
    expect(parseTier("夯")).toBeNull();
    expect(parseTier({})).toBeNull();
    // Number("") === 0，不加 trim 判空会静默变成 tier 0
    expect(parseTier(" ")).toBeNull();
  });
});

describe("summarizeTiers", () => {
  const ME = "me";

  it("分出自己的和别人的", () => {
    const s = summarizeTiers(
      [
        { user_id: "her", tier: 4 },
        { user_id: ME, tier: 1 },
      ],
      ME,
    );
    expect(s.mine).toBe(1);
    expect(s.others).toEqual([{ user_id: "her", tier: 4 }]);
    expect(s.count).toBe(2);
  });

  it("别人的按从好到差排", () => {
    const s = summarizeTiers(
      [
        { user_id: "a", tier: 5 },
        { user_id: "b", tier: 2 },
        { user_id: "c", tier: 4 },
      ],
      ME,
    );
    expect(s.others.map((o) => o.tier)).toEqual([2, 4, 5]);
  });

  it("best 含自己那一票", () => {
    const s = summarizeTiers(
      [
        { user_id: "her", tier: 4 },
        { user_id: ME, tier: 1 },
      ],
      ME,
    );
    expect(s.best).toBe(1);
  });

  it("自己没评过时 mine 是 null，但 best 仍然反映别人的", () => {
    const s = summarizeTiers([{ user_id: "her", tier: 2 }], ME);
    expect(s.mine).toBeNull();
    expect(s.best).toBe(2);
    expect(s.count).toBe(1);
  });

  it("空输入", () => {
    const s = summarizeTiers([], ME);
    expect(s).toEqual({ mine: null, others: [], best: null, count: 0 });
  });

  it("丢掉 DB 里的越界值，而不是把它算进 best", () => {
    // 极端情况：CHECK 约束被绕过 / 未来加了第 6 档但代码还没更新
    const s = summarizeTiers(
      [
        { user_id: "junk", tier: 0 as PlaceTier },
        { user_id: "her", tier: 3 },
      ],
      ME,
    );
    expect(s.best).toBe(3);
    expect(s.count).toBe(1);
  });

  // 不求平均是刻意的：一个人说夯、一个人说拉完了，平均成「人上人」
  // 恰好是最没信息量的一档，而分歧本身才是共享清单里最有用的信号。
  it("不求平均，两极分化时两头都留着", () => {
    const s = summarizeTiers(
      [
        { user_id: ME, tier: 1 },
        { user_id: "her", tier: 5 },
      ],
      ME,
    );
    expect(s.mine).toBe(1);
    expect(s.others[0].tier).toBe(5);
  });
});
