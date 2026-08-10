// 按用户的每日 AI 配额 —— **只在用户走 app 默认 key 时生效**。
//
// 起因：5 个注册用户全都没填自己的 key，也就是五个人共用同一把 GEMINI_API_KEY。
// 而 Gemini 的免费额度是按 key（按 Google Cloud 项目）算的，不是按终端用户算的，
// 所以一个人连着加店会把所有人的额度一起抽干，别人同时就撞「限流」。
//
// 用户自己填了 key → 花的是他自己的额度，不计数也不限制。
//
// 落地了 docs/decisions/0003-llm-cost-ceiling.md 里那个「支出无上限」的未决项。

import { createClient } from "@/lib/supabase/server";

/** 每人每天允许的 AI 调用次数（用 app 默认 key 时）。可用 env 覆盖。 */
export function dailyQuota(): number {
  const raw = Number(process.env.BITE_FREE_DAILY_CALLS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 40;
}

export type QuotaResult = {
  allowed: boolean;
  used: number;
  quota: number;
};

/**
 * 占用一次配额。返回 allowed=false 时调用方应当**不发起** LLM 调用。
 *
 * 被拒时不累加计数 —— 否则用户超限后每点一次都把数字推得更高，越用越难恢复。
 * 具体在 sql/0022 的 consume_llm_quota 里用一条语句原子完成，避免并发绕过。
 *
 * ⚠️ 配额检查失败（DB 挂了等）时**放行**：宁可多花一点额度，也不要因为计数系统
 * 出问题就把整个加店功能锁死。
 */
export async function consumeQuota(): Promise<QuotaResult> {
  const quota = dailyQuota();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("consume_llm_quota", { p_limit: quota })
      .maybeSingle<QuotaResult>();
    if (error || !data) return { allowed: true, used: 0, quota };
    return data;
  } catch {
    return { allowed: true, used: 0, quota };
  }
}

/** 超额时给用户看的话 —— 要指出「填自己的 key 就没这个限制」这条出路。 */
export function quotaExceededMessage(used: number, quota: number): string {
  return (
    `今天的 AI 额度用完了（${used}/${quota} 次）。这是大家共用的免费额度，` +
    `所以设了每人每天的上限。\n\n` +
    `想不受限的话，去「我的 → AI 模型设置」填一把自己的 Gemini key —— ` +
    `免费申请、两分钟搞定，之后就走你自己的额度，也不会再跟别人抢。`
  );
}
