import { describe, it, expect } from "vitest";
import { relDate } from "./rel-date";

const NOW = new Date("2026-06-01T12:00:00Z");
const dayMs = 24 * 60 * 60 * 1000;
function isoDaysAgo(n: number): string {
  return new Date(NOW.getTime() - n * dayMs).toISOString();
}

describe("relDate", () => {
  it("today (days=0)", () => {
    expect(relDate(isoDaysAgo(0), NOW)).toBe("今天");
  });

  it("yesterday (days=1)", () => {
    expect(relDate(isoDaysAgo(1), NOW)).toBe("昨天");
  });

  it("3 天前 (boundary <7)", () => {
    expect(relDate(isoDaysAgo(3), NOW)).toBe("3 天前");
  });

  it("days=6 仍是 '6 天前'", () => {
    expect(relDate(isoDaysAgo(6), NOW)).toBe("6 天前");
  });

  it("days=7 → '1 周前'", () => {
    expect(relDate(isoDaysAgo(7), NOW)).toBe("1 周前");
  });

  it("days=29 仍是 '4 周前'", () => {
    expect(relDate(isoDaysAgo(29), NOW)).toBe("4 周前");
  });

  it("days=30 → '1 月前'", () => {
    expect(relDate(isoDaysAgo(30), NOW)).toBe("1 月前");
  });

  it("days=364 仍是 '12 月前'", () => {
    expect(relDate(isoDaysAgo(364), NOW)).toBe("12 月前");
  });

  it("days=365 → '1 年前'", () => {
    expect(relDate(isoDaysAgo(365), NOW)).toBe("1 年前");
  });

  it("非法 ISO → 空串", () => {
    expect(relDate("not-a-date", NOW)).toBe("");
  });

  it("未来日期（clock skew）→ '今天'，不露出 '-N 年前'", () => {
    const future = new Date(NOW.getTime() + 10 * dayMs).toISOString();
    expect(relDate(future, NOW)).toBe("今天");
  });
});
