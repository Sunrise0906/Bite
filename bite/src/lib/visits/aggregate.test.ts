import { describe, it, expect } from "vitest";
import { aggregateVisitSignals, type VisitLogRow } from "./aggregate";

// 约定：输入按 visited_at 降序（调用方查询保证）
describe("aggregateVisitSignals", () => {
  it("空输入 → 空 map", () => {
    expect(aggregateVisitSignals([]).size).toBe(0);
  });

  it("单店单次造访", () => {
    const logs: VisitLogRow[] = [
      { place_id: "p1", visited_at: "2026-05-20", sentiment: "will_return", star_rating: 4 },
    ];
    expect(aggregateVisitSignals(logs).get("p1")).toEqual({
      count: 1,
      last_visit: "2026-05-20",
      last_sentiment: "will_return",
      avg_star: 4,
    });
  });

  it("单店多次：count 累加，last_* 取最近一次（输入首条）", () => {
    const logs: VisitLogRow[] = [
      { place_id: "p1", visited_at: "2026-05-20", sentiment: "okay", star_rating: 3 },
      { place_id: "p1", visited_at: "2026-04-01", sentiment: "will_return", star_rating: 5 },
    ];
    const v = aggregateVisitSignals(logs).get("p1")!;
    expect(v.count).toBe(2);
    expect(v.last_visit).toBe("2026-05-20");
    expect(v.last_sentiment).toBe("okay");
    expect(v.avg_star).toBe(4); // (3+5)/2
  });

  it("avg_star 只算有星级的造访，null 不计入", () => {
    const logs: VisitLogRow[] = [
      { place_id: "p1", visited_at: "2026-05-20", sentiment: "okay", star_rating: null },
      { place_id: "p1", visited_at: "2026-04-01", sentiment: "okay", star_rating: 4 },
    ];
    const v = aggregateVisitSignals(logs).get("p1")!;
    expect(v.count).toBe(2);
    expect(v.avg_star).toBe(4); // 只有一条有星
  });

  it("一条带星的都没有 → avg_star 为 null", () => {
    const logs: VisitLogRow[] = [
      { place_id: "p1", visited_at: "2026-05-20", sentiment: "wont_return", star_rating: null },
    ];
    expect(aggregateVisitSignals(logs).get("p1")!.avg_star).toBeNull();
  });

  it("star_rating 字段缺失（undefined）也按无星处理", () => {
    const logs: VisitLogRow[] = [
      { place_id: "p1", visited_at: "2026-05-20", sentiment: "okay" },
    ];
    expect(aggregateVisitSignals(logs).get("p1")!.avg_star).toBeNull();
  });

  it("多店各自独立聚合", () => {
    const logs: VisitLogRow[] = [
      { place_id: "p1", visited_at: "2026-05-20", sentiment: "will_return", star_rating: 5 },
      { place_id: "p2", visited_at: "2026-05-19", sentiment: "wont_return", star_rating: 2 },
      { place_id: "p1", visited_at: "2026-05-01", sentiment: "okay", star_rating: 3 },
    ];
    const m = aggregateVisitSignals(logs);
    expect(m.get("p1")).toEqual({
      count: 2,
      last_visit: "2026-05-20",
      last_sentiment: "will_return",
      avg_star: 4,
    });
    expect(m.get("p2")).toEqual({
      count: 1,
      last_visit: "2026-05-19",
      last_sentiment: "wont_return",
      avg_star: 2,
    });
  });
});
