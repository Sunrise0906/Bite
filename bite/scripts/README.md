# scripts/

手工验证脚本与截图脚本。都是纯 Node（`.mjs`），从 `bite/` 目录运行：

```bash
node scripts/verify/encryption.mjs
```

所有脚本读同目录树下的 `.env.local`（`verify/` 和 `shoot/` 在深度 2 → `../../.env.local`；
`cleanup-e2e.mjs` 在深度 1 → `../.env.local`）。截图统一输出到 `bite/screenshots/`（已 gitignore）。

默认全部打 `http://localhost:3000`，用 `VERIFY_BASE` / `E2E_BASE_URL` 覆盖。

---

## verify/ — 子系统验证

⚠️ 这几个脚本是下列子系统在全仓库**唯一**的自动化覆盖：vitest 只收 `src/**/*.test.ts`，
Playwright 的 `tests/e2e/` 也不碰它们。改动对应子系统时请手工跑一遍。

| 脚本 | 验证什么 | 需要 | 写库？ |
| --- | --- | --- | --- |
| `signed-render.mjs` | **私有照片签名 URL 不变量**：展示页出现 `/object/sign/`，编辑页 textarea 仍是 canonical `/object/public/` | dev server | ✅ 自清理 |
| `encryption.mjs` | `user_llm_settings.api_key` 的 AES-256-GCM 静态加密往返 | — | ✅ 自清理 |
| `photo.mjs` | 拍照上传 → Supabase Storage → 入库全链路 | dev server | ✅ 自清理 |
| `ratelimit.mjs` | `/api/chat` 滑动窗口限流（10/分、100/时）真的会挡 | dev server | ❌ |
| `pick-duo.mjs` | **「一起选」双人匹配**：两个账号各自滑卡，都右滑同一家 → 匹配 | dev server + 两个测试账号 | ✅ 自清理 |
| `add.mjs` | quick-add 加店主流程 | dev server | ✅ 自清理 |
| `enrich.mjs` | Google 自动丰富（评分 + 坐标）回填 | dev server | ✅ 自清理 |
| `google-oauth.mjs` | 登录页 Google OAuth 按钮跳转正确 | — | ❌ |

需要两个测试账号的脚本读 `E2E_TEST_EMAIL(_2)` / `E2E_TEST_PASSWORD(_2)`。

## shoot/ — UI 截图

跑之前先 `npm run dev`。输出到 `bite/screenshots/`。

| 脚本 | 截什么 |
| --- | --- |
| `themes.mjs` | 4 套主题 × 手机/桌面 × 明/暗 —— **改 CSS 后的前后对比就靠它** |
| `addflow.mjs` | 加店流程：主页 → 单店确认 → 合集多店 → 错误态 |
| `newfeat.mjs` | /stats、一起选、清单入口、主页 |
| `v2-home.mjs` `v2-chat.mjs` `v2-detail.mjs` `v2-more.mjs` | 各主要页面 |

## cleanup-e2e.mjs

e2e 跑挂时留下的 `[E2E]` 前缀测试数据清理器。用 service-role key 直连，
所以它能删 RLS 挡住的残留。**跑之前确认 `E2E_BASE_URL` 指的是你想清理的那个环境。**
