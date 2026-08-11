import { describe, it, expect } from "vitest";
import { votesNeeded } from "./rules";

describe("votesNeeded", () => {
  it("2 人时和旧的写死行为完全一致（两个人都右滑）", () => {
    expect(votesNeeded(2)).toBe(2);
  });

  it("3 人 → 2（多数）", () => {
    expect(votesNeeded(3)).toBe(2);
  });

  it("4 人 → 3，5 人 → 3", () => {
    expect(votesNeeded(4)).toBe(3);
    expect(votesNeeded(5)).toBe(3);
  });

  it("单人清单不会自己右滑一家就「就它了」", () => {
    // 那一屏的语义是「右滑收藏，滑完随机挑一家」
    expect(votesNeeded(1)).toBe(2);
    expect(votesNeeded(0)).toBe(2);
  });

  it("永远不超过总人数（否则永远匹配不上）", () => {
    for (let n = 2; n <= 12; n++) expect(votesNeeded(n)).toBeLessThanOrEqual(n);
  });
});
