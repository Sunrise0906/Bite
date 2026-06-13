// Chat 端点的轻量限流：防止单个用户（或被盗 session）刷爆开发者出资的默认 LLM key。
//
// 实现：进程内 in-memory 滑动窗口，per-user 两档（每分钟突发 + 每小时累计）。
// 取舍：Vercel serverless 是多实例 / 易回收的，in-memory 限流只在单实例内生效，
//   挡不住分布式刷量。但本 app 的威胁模型是「自己人 + 偶发 stuck loop / 连点」，
//   突发请求通常落在同一个 warm 实例上，这层足以兜住跑飞的成本，且零 migration、
//   零额外 DB 负载。要更强保证（跨实例）再上 Supabase 计数表 / Upstash。
//
// 一条用户消息最多触发 MAX_TOOL_LOOPS(6) 轮 provider 调用，所以阈值按「消息数」定，
// 留足真人用量（没人 1 分钟发 10 条还各自打满 6 轮工具）。

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number; message: string };

export type RateLimitConfig = {
  /** 每分钟消息上限 */
  perMinute: number;
  /** 每小时消息上限 */
  perHour: number;
};

export const DEFAULT_CHAT_LIMITS: RateLimitConfig = {
  perMinute: 10,
  perHour: 100,
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// userId → 最近请求时间戳（升序）。只保留最近 1 小时内的。
const hits = new Map<string, number[]>();

/**
 * 检查并记录一次 chat 请求。返回 ok=false 时调用方应回 429。
 * now 可注入便于测试。命中 ok=true 时会把本次时间戳计入窗口。
 */
export function checkChatRateLimit(
  userId: string,
  config: RateLimitConfig = DEFAULT_CHAT_LIMITS,
  now: number = Date.now(),
): RateLimitResult {
  const cutoff = now - HOUR_MS;
  const prev = hits.get(userId) ?? [];
  // 丢掉 1 小时前的
  const recent = prev.filter((t) => t > cutoff);

  const inLastMinute = recent.filter((t) => t > now - MINUTE_MS).length;
  const inLastHour = recent.length;

  if (inLastMinute >= config.perMinute) {
    // 距离最早那条「分钟内」请求滚出窗口还要多久
    const oldestInMinute = recent.find((t) => t > now - MINUTE_MS) ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldestInMinute + MINUTE_MS - now) / 1000),
    );
    hits.set(userId, recent); // 不计入被拒的这次
    return {
      ok: false,
      retryAfterSec,
      message: `发得太快了，请 ${retryAfterSec} 秒后再试。`,
    };
  }

  if (inLastHour >= config.perHour) {
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + HOUR_MS - now) / 1000),
    );
    const mins = Math.ceil(retryAfterSec / 60);
    hits.set(userId, recent);
    return {
      ok: false,
      retryAfterSec,
      message: `本小时对话已达上限，约 ${mins} 分钟后恢复。`,
    };
  }

  recent.push(now);
  hits.set(userId, recent);
  return { ok: true };
}

/** 测试用：清空所有计数 */
export function _resetChatRateLimit(): void {
  hits.clear();
}
