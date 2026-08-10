// LLM 调用的重试 + 跨 provider 故障转移策略（纯逻辑，无 I/O，可单测）。
//
// 起因：用户连着加了很多店，每加一家 = 一次 LLM 抽取，撞上 Gemini 免费层的
// 每分钟请求数上限，前端直接甩出「限流，请稍后再试」—— 不重试、不说是谁的限制、
// 也不告诉用户等多久。
//
// 两层兜底：
//   1. 同一个 provider 先退避重试几次（免费层的限流窗口通常是「每分钟」级，
//      等一下就恢复）
//   2. 还不行就换下一个**已配置 app key** 的 provider（多 LLM 抽象本来就在）
//
// ⚠️ 只对「等一下/换一家就可能成功」的错误转移。auth / missing_key 是配置错了，
// 换 provider 只会把同一个错误重复 N 遍，还会掩盖真正的原因。

import type { LlmError, ProviderId } from "./types";

/**
 * 值得重试 / 转移的错误类型。
 * auth / missing_key 是配置错了 —— 换 provider 只会把同一个错误重复 N 遍。
 * unknown 不列入：来源不明，重试可能是在放大一个真 bug。
 */
export function isTransient(kind: LlmError["type"]): boolean {
  return kind === "rate_limit" || kind === "api" || kind === "parse";
}

/**
 * 值得「原地等一下再试同一个 provider」的：
 *  - rate_limit：免费层窗口是分钟级，等一下就恢复
 *  - parse：模型这次没吐出合法 JSON，采样有随机性，重来一次常常就好了
 * api 类（多为 5xx）直接换下一家更快。
 */
export function shouldRetrySameProvider(kind: LlmError["type"]): boolean {
  return kind === "rate_limit" || kind === "parse";
}

/**
 * 第 attempt 次重试前等多久（毫秒）。attempt 从 0 开始。
 * 指数退避 + 抖动，避免多个请求同时醒来又一起撞限流。
 *
 * jitter 由调用方注入（0..1），方便测试确定化。
 */
export function backoffMs(attempt: number, jitter = Math.random()): number {
  const base = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s…
  const capped = Math.min(base, 8000);
  return Math.round(capped * (0.75 + jitter * 0.5)); // ±25% 抖动
}

/**
 * 排出候选 provider 顺序：用户选的排第一，其后是其他**配了 app key** 的。
 *
 * @param preferred 用户在设置里选的（或系统默认）
 * @param hasAppKey 判断某个 provider 有没有 app 默认 key（读 env）
 * @param order 备选的固定优先级 —— 免费的排前面，省得默认就烧钱
 */
export function providerChain(
  preferred: ProviderId,
  hasAppKey: (id: ProviderId) => boolean,
  order: ProviderId[] = ["gemini", "qwen", "deepseek", "openai", "anthropic"],
): ProviderId[] {
  const chain: ProviderId[] = [preferred];
  for (const id of order) {
    if (id !== preferred && hasAppKey(id)) chain.push(id);
  }
  return chain;
}

/**
 * 全部试完仍失败时给用户看的话。
 *
 * 关键是别再甩「限流，请稍后再试」这种没主语的原始错误 —— 用户不知道是谁在限流、
 * 等多久、是不是自己配错了。
 */
export function exhaustedMessage(
  lastKind: LlmError["type"],
  triedCount: number,
): string {
  if (lastKind === "rate_limit") {
    return triedCount > 1
      ? "几个 AI 服务这会儿都在限流（免费额度按分钟计）。等一分钟左右再试，或去「我的 → AI 模型设置」填一把自己的 key。"
      : "AI 免费额度每分钟有上限，刚刚连着加得有点快。等 30 秒左右再试一次就行。";
  }
  if (lastKind === "parse") return "AI 没能正确解析这段内容，换个说法或重试一次。";
  if (lastKind === "missing_key") {
    return "还没有可用的 AI key。去「我的 → AI 模型设置」填一个（Gemini 有免费额度）。";
  }
  if (lastKind === "auth") {
    return "AI key 无效，去「我的 → AI 模型设置」检查一下。";
  }
  return "AI 服务暂时不可用，稍后再试。";
}
