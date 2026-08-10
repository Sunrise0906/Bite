@AGENTS.md

# Bite 项目约定

## 设计文档

完整产品设计：[../docs/Bite_设计文档.md](../docs/Bite_设计文档.md)

## 关键决策

- **多 LLM 抽象层**：Gemini（默认，`DEFAULT_PROVIDER`）+ Anthropic + OpenAI + DeepSeek +
  Qwen。抽象在 `src/lib/llm/types.ts`（接口 + `StreamChunk` 联合）和 `src/lib/llm/router.ts`
  （settings 加载 + provider 工厂）。Anthropic 单独一份实现，其余四家共用 `openai-compat.ts`。
- **App 默认 LLM key 由开发者出**，朋友 / 女朋友开箱即用；Settings 可填自带 key 覆盖。
  各家免费额度是**按 key 算的、不是按用户算的**，所以共用一把 key 的人会互相抢。
  现在有两道闸：撞限流会自动退避重试并换下一个配了 key 的 provider
  （`src/lib/llm/failover.ts`），以及**每人每日调用上限**（`src/lib/llm/quota.ts` +
  `sql/0022`，仅对走 app 默认 key 的用户生效）。/profile 有自建 key 的引导。
- **登录**：Email/密码 + Magic Link + Google OAuth；任意邮箱（QQ/163/Gmail/Outlook）可注册
- **Place 跨 list 不去重**：同店在不同 list 是独立记录；仅共享 list 内 reason 字段聚合 `[{user_id, text}]`
- **小红书**：`src/lib/places/xhs.ts` 会**实际抓取** xiaohongshu.com（伪装 Chrome UA 读
  `__INITIAL_STATE__`），并把帖子图片转存进自有 Storage bucket。这与最初「仅纯文本粘贴、
  不爬服务器」的决策相反 —— 见 [`docs/decisions/0001-xhs-scraping-scope.md`](../docs/decisions/0001-xhs-scraping-scope.md)（**未决**）。

## Next.js 16 关键变化

- `middleware.ts` → `proxy.ts`（**Node.js runtime**，**不**支持 edge）
- `cookies()` / `headers()` / `params` / `searchParams` 全部 async，必须 `await`
- 类型 helper：`PageProps<'/路径'>` / `LayoutProps<'/路径'>` / `RouteContext<'/路径'>`
- 默认 Turbopack，不需要 `--turbopack` flag
- `next lint` 命令删除，用 `npx eslint` 或 `npm run lint`（已配置）

## 代码约定

- UI 文案 **全中文**
- **`src/lib/actions/` 是全应用唯一的写入面**。这条不变量可以一行验证，别破坏它：
  ```bash
  grep -rl '"use server"' src/ | grep -v 'src/lib/actions' # 必须为空
  ```
- 缓存失效统一用 `revalidatePath`（全仓库 63 处）。不用 `updateTag` / `revalidateTag` / `cacheTag`
- DB 权限走 **Supabase RLS**，应用层不再重复鉴权
- ⚠️ **RLS 挡掉写入时 Postgres 不报错、只是影响 0 行**。所以 UPDATE / DELETE 后必须
  追加 `.select("id")` 检查行数，否则 UI 会显示「已完成」而数据库毫无变化。
  参考 `lib/actions/visits.ts` 的 `updateVisit` / `deleteVisit`
- 错误信息对用户友好（中文），不直接抛 Supabase 错误码
- 路径别名 `@/*` → `./src/*`
- 提交前跑 `npm run verify`（typecheck + lint + test + build）；CI 也跑这四项

## migration

`sql/` 下手工编号的 `.sql`，在 Supabase SQL Editor 里按顺序粘贴执行。**没有 migration
ledger**——没有任何地方记录某个环境跑到哪一版。权威清单只有一份：
[`README.md` → 数据库初始化](./README.md#数据库初始化)。
