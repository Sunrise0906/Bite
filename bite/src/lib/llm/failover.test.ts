import { describe, it, expect } from "vitest";
import {
  isTransient,
  shouldRetrySameProvider,
  backoffMs,
  providerChain,
  exhaustedMessage,
} from "./failover";
import type { ProviderId } from "./types";

describe("isTransient — 什么错值得换一家再试", () => {
  it("限流 / api / parse 值得", () => {
    expect(isTransient("rate_limit")).toBe(true);
    expect(isTransient("api")).toBe(true);
    expect(isTransient("parse")).toBe(true);
  });

  it("auth / missing_key **不**值得 —— 配置错了，换几家都是同一个错", () => {
    expect(isTransient("auth")).toBe(false);
    expect(isTransient("missing_key")).toBe(false);
  });

  it("unknown 不重试 —— 来源不明，重试可能只是在放大一个真 bug", () => {
    expect(isTransient("unknown")).toBe(false);
  });
});

describe("shouldRetrySameProvider", () => {
  it("限流值得原地等（免费层窗口是分钟级）", () => {
    expect(shouldRetrySameProvider("rate_limit")).toBe(true);
  });

  it("parse 值得原地重来（采样有随机性）", () => {
    expect(shouldRetrySameProvider("parse")).toBe(true);
  });

  it("api 类不原地等，直接换下一家更快", () => {
    expect(shouldRetrySameProvider("api")).toBe(false);
  });
});

describe("backoffMs", () => {
  it("指数增长", () => {
    expect(backoffMs(0, 0.5)).toBeLessThan(backoffMs(1, 0.5));
    expect(backoffMs(1, 0.5)).toBeLessThan(backoffMs(2, 0.5));
  });

  it("有上限，不会等到天荒地老", () => {
    expect(backoffMs(10, 0.5)).toBeLessThanOrEqual(8000 * 1.25);
  });

  it("抖动在 ±25% 内（避免同时醒来又一起撞限流）", () => {
    const lo = backoffMs(0, 0);
    const hi = backoffMs(0, 1);
    expect(lo).toBe(750);
    expect(hi).toBe(1250);
  });

  it("第一次重试就在 1 秒量级 —— 用户不会觉得卡死", () => {
    expect(backoffMs(0, 0.5)).toBeLessThanOrEqual(1100);
  });
});

describe("providerChain", () => {
  const all = () => true;
  const none = () => false;

  it("用户选的永远排第一", () => {
    expect(providerChain("deepseek", all)[0]).toBe("deepseek");
  });

  it("没有其他 app key 时只剩它自己", () => {
    expect(providerChain("gemini", none)).toEqual(["gemini"]);
  });

  it("不重复列出用户选的那一个", () => {
    const chain = providerChain("gemini", all);
    expect(chain.filter((c) => c === "gemini")).toHaveLength(1);
  });

  it("备选里免费的排在付费的前面（别默认就烧钱）", () => {
    const chain = providerChain("openai", all);
    const gemini = chain.indexOf("gemini");
    const anthropic = chain.indexOf("anthropic");
    expect(gemini).toBeGreaterThan(-1);
    expect(gemini).toBeLessThan(anthropic);
  });

  it("只把**配了 key** 的排进来", () => {
    const configured = new Set<ProviderId>(["gemini", "qwen"]);
    const chain = providerChain("gemini", (id) => configured.has(id));
    expect(chain).toEqual(["gemini", "qwen"]);
  });
});

describe("exhaustedMessage — 别再甩没主语的原始错误", () => {
  it("单个 provider 限流：说清是免费额度 + 等多久", () => {
    const m = exhaustedMessage("rate_limit", 1);
    expect(m).toContain("免费额度");
    expect(m).toMatch(/秒/);
    expect(m).not.toBe("限流，请稍后再试");
  });

  it("多个 provider 都限流：提示可以填自己的 key", () => {
    const m = exhaustedMessage("rate_limit", 3);
    expect(m).toContain("AI 模型设置");
  });

  it("缺 key / key 无效：指到设置页，而不是说「稍后再试」", () => {
    expect(exhaustedMessage("missing_key", 1)).toContain("AI 模型设置");
    expect(exhaustedMessage("auth", 1)).toContain("AI 模型设置");
    expect(exhaustedMessage("auth", 1)).not.toContain("稍后");
  });

  it("任何情况都给中文可懂的话", () => {
    for (const k of ["rate_limit", "auth", "missing_key", "parse", "api", "unknown"] as const) {
      const m = exhaustedMessage(k, 2);
      expect(m.length).toBeGreaterThan(6);
      expect(m).toMatch(/[一-龥]/);
    }
  });
});
