import { describe, it, expect } from "vitest";
import { isActive, ACTIVE_WINDOW_MS } from "./active";

const NOW = Date.parse("2026-08-11T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("isActive", () => {
  it("刚打过卡 → 活跃", () => {
    expect(isActive(ago(10_000), NOW)).toBe(true);
  });

  it("窗口边界内算活跃", () => {
    expect(isActive(ago(ACTIVE_WINDOW_MS - 1), NOW)).toBe(true);
  });

  it("超过窗口 → 不活跃", () => {
    expect(isActive(ago(ACTIVE_WINDOW_MS + 1), NOW)).toBe(false);
  });

  it("从没打过卡（0026 之前的老用户）→ 不活跃，而不是崩", () => {
    expect(isActive(null, NOW)).toBe(false);
    expect(isActive(undefined, NOW)).toBe(false);
  });

  it("时间串是脏的 → 不活跃", () => {
    expect(isActive("not-a-date", NOW)).toBe(false);
  });

  it("未来时间也算活跃（客户端时钟偏了，显示「离线」更糟）", () => {
    expect(isActive(new Date(NOW + 60_000).toISOString(), NOW)).toBe(true);
  });
});
