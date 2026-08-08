# ADR 0004 — 要不要开放注册

- **状态**：未决 ⚠️（**这是决定其他一切优先级的那个岔路**）
- **提出**：2026-08-07
- **决定人**：项目所有者

## 为什么这条排第一

Bite 现在的很多设计，隐含前提是「注册的都是熟人」：

- `profiles_select_authenticated ... using (true)` —— 任何登录用户可读全站 profiles
  （邮箱、昵称、头像）。推荐功能靠按邮箱查人，所以需要这个。
- `testLlmConnection` 无限流，任意登录用户可点，花的是开发者的 key
  （见 [`0003-llm-cost-ceiling.md`](./0003-llm-cost-ceiling.md)）。
- 「一起选」的匹配规则是「任意 2 个不同用户右滑同一家就结束」，假定清单里就两个人。

在熟人信任模型下，这些都可以先放着。**一旦对不认识的人开放，它们从「理论问题」
变成「实际被打穿」。**

## 已经修掉的（sql/0017）

邀请链路的越权提权已经修了，因为它严重到不该等这个决策：
任意登录用户曾可以读走全库邀请 token、把任一条改成 `co_owner`、然后自助入伙。
详见 `bite/sql/0017_invite_privilege_escalation.sql` 的文件头。

## 如果决定开放注册，前置条件

1. **`profiles` 的 select 策略收紧** —— 现在是 `using (true)`。推荐功能需要「按邮箱找人」，
   但不需要「能列举所有人」。改法：把查人收进一个 `SECURITY DEFINER` 函数
   `find_user_by_email(text)`，只返回精确匹配的一行（同 `get_invite_preview` 的思路），
   然后把表级 select 收紧到「自己 + 与自己共享清单的人」。
   注意 `escapeLikePattern` 已经挡住了 `%@gmail.com` 这类通配符枚举——但那是应用层，
   RLS 层仍然是敞开的。
2. **成本收口** —— 见 [`0003`](./0003-llm-cost-ceiling.md) 第 2 条起。开发者的 key 给
   陌生人用是无底洞。
3. **限流从内存态换成 Postgres** —— serverless 上每实例一份的 `Map` 挡不住任何人。
4. **滥用面复核** —— XHS 抓取的 SSRF（见 [`0001`](./0001-xhs-scraping-scope.md)）、
   photos bucket 的孤儿对象无 GC、`places.notes` 的无长度上限追加。

## 如果决定不开放

那就把这个前提**写进产品**，而不是留在假设里：

- 注册页加白名单（邮箱域名 / 邀请码 / Supabase Auth 关掉 public signup，只允许邀请）
- 在 README 和 CLAUDE.md 里写明「熟人信任模型」是一条**设计约束**，
  这样未来的你和 AI agent 都不会误以为 RLS 已经足够对抗陌生人

## 建议

**不开放**，并显式关掉 public signup。这个产品的价值主张（AI 只从你自己攒的库里选、
双人一起选）本身就是私人工具，开放注册不增加任何用户价值，却把上面四条全变成必答题。

如果哪天真想给更多人用，按上面的前置条件清单逐条做完再开。
