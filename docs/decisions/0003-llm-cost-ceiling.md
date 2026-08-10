# ADR 0003 — 默认 LLM key 的支出上限

- **状态**：部分已决（2026-08-10）—— 限流兜底与每人每日配额已落地；总预算/降级策略仍未决
- **提出**：2026-08-07
- **决定人**：项目所有者

## 背景

`bite/CLAUDE.md` 里的产品承诺是：

> **App 默认 LLM key 由开发者出**，朋友 / 女朋友开箱即用；Settings 可填自带 key 覆盖

也就是说**你的钱包是所有用户的默认额度**。目前这个承诺没有任何支出上限。

## 三个缺口

**1. 客户端断开不会中止上游调用。**
`bite/src/app/api/chat/route.ts` 有一句注释写着「客户端断开就停掉这次 LLM 调用，省 token」，
但 `signal` 在 `anthropic.ts` / `openai-compat.ts` / `types.ts` 的 `StreamChatParams` 里
**一次都没出现**。跳出 `for await` 只是断开本地迭代器，`stream.abort()` 从未被调用——
上游继续生成、继续计费，而且这轮 usage 也不会写进 `messages.usage`，所以**在用量统计里
完全看不见**。用户每按一次「停止」都会产生一笔隐形开销。

**2. 限流只覆盖四条烧钱路径里的一条。**
`lib/ratelimit/chat-limit.ts` 只保护 `/api/chat`，且只数用户消息。没有覆盖的：

| 路径 | 花什么钱 |
| --- | --- |
| `processTextDraft` / `processImageDraft`（quick-add） | LLM 抽取，vision 尤其贵 |
| `xhs-enrich` | LLM 抽取 |
| `testLlmConnection`（/profile 的「测试连接」按钮） | LLM 调用；任意登录用户可无限点 |
| chat 里的 `check_place_details` / `find_similar_places` | Google Places 付费 SKU，**无缓存**，调用次数由模型在 6 轮 tool loop 里自行决定 |

注意限流本身还是**内存态**的（`Map` in module scope），在 Vercel serverless 上每个实例
一份、冷启动即清零——所以即使是 `/api/chat` 那条，实际约束力也弱于字面值。

**3. 没有每用户计费口径。**
`messages.usage` 有 token 数，但没有按用户聚合的账单视图，也没有任何阈值告警。
`/profile` 的用量卡是**全表扫描**（`.select("usage, created_at").eq("role","assistant")`
无 conversation/user 前置过滤，纯靠 RLS 收敛，`messages` 表既无 `role` 索引也无
反范式的 `user_id`），随聊天历史增长对所有人同时劣化。

## 已落地（2026-08-10）

用户的女朋友一次加很多店撞上「限流，请稍后再试」之后做的：

1. **限流不再直接甩给用户** —— `src/lib/llm/failover.ts`：撞 429 先退避重试
   （1s/2s/4s + 抖动），仍失败自动切下一个**配了 app key** 的 provider
   （gemini → qwen → deepseek → openai → anthropic，免费的排前面）。
   只对 rate_limit / api / parse 转移；auth / missing_key 立刻抛出。
   用户自带 key 时**不转移**（他明确指定了要用谁）。
2. **每人每日调用上限** —— `src/lib/llm/quota.ts` + `sql/0022` 的
   `consume_llm_quota()`。仅对走 app 默认 key 的用户生效；被拒时不累加计数。
   上限用 `BITE_FREE_DAILY_CALLS` 配（默认 40）。
3. **自建 key 引导** —— /profile 的 AI 设置里给出各家申请入口 + 三步说明，
   把「去哪申请」从用户脑子里搬到界面上。

关键事实（当初没写清楚的）：**各家的免费额度是按 key / 按项目算的，不是按终端
用户算的**。实测 5 个注册用户 0 个自带 key —— 五个人共用一把 GEMINI_API_KEY，
所以一个人连着加店就会把所有人的额度一起抽干。

## 仍未决

- 总预算上限是多少？超了之后是降级到更便宜的模型、强制自带 key、还是直接拒？
- 是否要为 Gemini 付费层付钱
- chat 流式路径还没接配额（只有抽取接了）—— 流中途拒绝的 UX 要单独设计

## 需要你定的数字

在能提方案之前，需要一个具体的钱包边界，例如：
- 每人每月多少 token？
- 每人每天多少次 Google Places 调用？
- 超额之后怎么办——降级到更便宜的模型、强制自带 key、还是直接拒绝？

## 可选的收口方式（按成本从低到高）

1. **把 abort 传下去** —— 纯 bug 修复，无需决策，建议无论如何都做：
   `StreamChatParams` 加 `signal`，两个 provider 透传给 SDK。
2. **限流覆盖所有四条路径**，并从内存态换成 Postgres 表（serverless 下才真正生效）。
3. **把最贵的两条设为自带 key 专属**：vision 抽取 和 `find_similar_places`。
4. **每用户月度 token 预算** + 超额后强制自带 key。需要先给 `messages` 加
   反范式的 `user_id` + 索引，否则统计本身就是性能问题。

## 建议

**第 1 条立刻做**（是 bug 不是策略）。第 2 条在开放给熟人圈以外之前必须做。
第 3、4 条等你给出具体数字。

相关：如果这个 app 永远只给女朋友 + 几个朋友用，第 2-4 条的紧迫性都很低；
一旦考虑开放注册，它们和 [`0004-open-registration.md`](./0004-open-registration.md) 一起变成前置条件。
