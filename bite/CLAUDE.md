@AGENTS.md

# Bite 项目约定

## 设计文档

完整产品设计：[../docs/Bite_设计文档.md](../docs/Bite_设计文档.md)

## 关键决策（设计文档之外，2026-05-19 对齐）

- **15 天工期**（压缩自原 4 周计划）
- v1 外部数据源仅小红书，且仅 **纯文本粘贴路径**（不爬 xhs 服务器）；Yelp / Reddit → v2
- **多 LLM 抽象层**：Claude（默认）+ OpenAI + DeepSeek + Qwen，统一 `src/lib/llm/provider.ts`
- **App 默认 LLM key 由开发者出**，朋友 / 女朋友开箱即用；Settings 可填自带 key 覆盖
- **登录**：Email/密码 + Magic Link + Google OAuth；任意邮箱（QQ/163/Gmail/Outlook）可注册
- **Place 跨 list 不去重**：同店在不同 list 是独立记录；仅共享 list 内 reason 字段聚合 `[{user_id, text}]`

## Next.js 16 关键变化

- `middleware.ts` → `proxy.ts`（**Node.js runtime**，**不**支持 edge）
- `cookies()` / `headers()` / `params` / `searchParams` 全部 async，必须 `await`
- 类型 helper：`PageProps<'/路径'>` / `LayoutProps<'/路径'>` / `RouteContext<'/路径'>`
- 默认 Turbopack，不需要 `--turbopack` flag
- `next lint` 命令删除，用 `npx eslint` 或 `npm run lint`（已配置）
- `revalidateTag(tag, 'max')` 需要第二个参数；Server Action 内用 `updateTag` 实现 read-your-writes

## 代码约定

- UI 文案 **全中文**
- 服务端写入用 **Server Actions**；route handlers 仅用于 OAuth 回调等必要场景
- DB 权限走 **Supabase RLS**，应用层不再重复鉴权
- 错误信息对用户友好（中文），不直接抛 Supabase 错误码
- 路径别名 `@/*` → `./src/*`
