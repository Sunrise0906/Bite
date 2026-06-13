import { describe, it, expect, beforeEach } from "vitest";
import {
  checkChatRateLimit,
  _resetChatRateLimit,
  type RateLimitConfig,
} from "./chat-limit";

const CFG: RateLimitConfig = { perMinute: 3, perHour: 5 };

describe("checkChatRateLimit", () => {
  beforeEach(() => _resetChatRateLimit());

  it("放行窗口内的请求", () => {
    const t = 1_000_000;
    expect(checkChatRateLimit("u1", CFG, t).ok).toBe(true);
    expect(checkChatRateLimit("u1", CFG, t + 1).ok).toBe(true);
    expect(checkChatRateLimit("u1", CFG, t + 2).ok).toBe(true);
  });

  it("超过每分钟上限即拒，并给出 retryAfter", () => {
    const t = 1_000_000;
    checkChatRateLimit("u1", CFG, t);
    checkChatRateLimit("u1", CFG, t + 1);
    checkChatRateLimit("u1", CFG, t + 2);
    const r = checkChatRateLimit("u1", CFG, t + 3);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterSec).toBeGreaterThan(0);
      expect(r.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });

  it("被拒的请求不计入窗口（不会把自己越推越远）", () => {
    const t = 1_000_000;
    checkChatRateLimit("u1", CFG, t);
    checkChatRateLimit("u1", CFG, t + 1);
    checkChatRateLimit("u1", CFG, t + 2);
    // 连续被拒
    checkChatRateLimit("u1", CFG, t + 3);
    checkChatRateLimit("u1", CFG, t + 4);
    // 一分钟后最早 3 条滚出窗口 → 又能发
    const r = checkChatRateLimit("u1", CFG, t + 60_001);
    expect(r.ok).toBe(true);
  });

  it("分钟窗口滑动：旧请求过期后恢复", () => {
    const t = 1_000_000;
    checkChatRateLimit("u1", CFG, t);
    checkChatRateLimit("u1", CFG, t + 10_000);
    checkChatRateLimit("u1", CFG, t + 20_000);
    expect(checkChatRateLimit("u1", CFG, t + 25_000).ok).toBe(false);
    // 第一条（t）在 t+60_001 滚出，留 2 条 → 放行
    expect(checkChatRateLimit("u1", CFG, t + 60_001).ok).toBe(true);
  });

  it("每小时上限独立生效（分钟不超但小时超）", () => {
    const t = 1_000_000;
    // 每 90 秒发一条：永远不触发分钟限，但 5 条后触发小时限
    for (let i = 0; i < 5; i++) {
      const r = checkChatRateLimit("u1", CFG, t + i * 90_000);
      expect(r.ok).toBe(true);
    }
    const r = checkChatRateLimit("u1", CFG, t + 5 * 90_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("本小时");
  });

  it("不同用户互不影响", () => {
    const t = 1_000_000;
    checkChatRateLimit("u1", CFG, t);
    checkChatRateLimit("u1", CFG, t + 1);
    checkChatRateLimit("u1", CFG, t + 2);
    expect(checkChatRateLimit("u1", CFG, t + 3).ok).toBe(false);
    // u2 全新
    expect(checkChatRateLimit("u2", CFG, t + 3).ok).toBe(true);
  });
});
