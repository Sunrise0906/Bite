# Bite

餐厅记录 + AI 决策 + 多人协作 web app。

完整产品设计：[`../docs/Bite_设计文档.md`](../docs/Bite_设计文档.md)

## 技术栈

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** + **Tailwind 4**
- **Supabase**（Postgres + RLS + Auth + Storage）
- **多 LLM provider**：Google Gemini（默认免费）/ Anthropic Claude / OpenAI GPT / DeepSeek / 通义千问 Qwen
- **地图**：Google Maps + Places API (New)
- **邮件**：两套并存 —— 登录邮件（注册验证 / Magic Link）走 Supabase Auth 内置服务；
  产品通知邮件（朋友推荐提醒）走 Resend（`src/lib/email/send.ts`，未配 `RESEND_API_KEY` 则静默跳过）
- **通知**：Web Push（VAPID + `web-push`），四个触发点：推荐 / 邀请 / 共享清单加新店 / 一起选匹配

## 本地开发

```bash
cd bite
npm install
cp .env.example .env.local   # 填入真实 key
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

### 必备环境变量

最低能跑起来：

| 变量 | 用途 | 在哪拿 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址 | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 匿名 key（前端用，RLS 兜底） | 同上 |
| `GEMINI_API_KEY` | Google Gemini 默认 AI（**真免费**） | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Places autocomplete + 地图 | Google Cloud Console，**记得加 HTTP referrer 白名单** |
| `NEXT_PUBLIC_APP_URL` | OAuth callback + Magic Link 邮件里的链接基址 | 本地 `http://localhost:3000`；生产填部署域名（**必须**否则邮件链接指错地方） |

可选（让用户能选其他 provider）：

- `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` · `DEEPSEEK_API_KEY` · `DASHSCOPE_API_KEY`

可选（推荐通知邮件）：

- `RESEND_API_KEY` · `EMAIL_FROM` —— 朋友推荐你一家店时给你发提醒邮件（`src/lib/email/send.ts`，不配则静默跳过）
- 登录邮件是另一回事：走 Supabase Auth 内置服务；想用自家域名发件就在 Supabase Auth → Email Settings 配 SMTP

可选（Web Push 通知）：

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT`（`npx web-push generate-vapid-keys` 生成）
- `SUPABASE_SERVICE_ROLE_KEY` —— **Web Push 必需**。发推送要读*别人的* `push_subscriptions` 行，RLS 挡得死死的，只能走 service role（唯一消费者 `src/lib/push/send.ts`，经 `src/lib/supabase/admin.ts`）。不配则 `createAdminClient()` 返回 `null`，推送**永久静默失效**。它能绕过所有 RLS，绝不能加 `NEXT_PUBLIC_` 前缀。

可选（站内小红书搜索）：`SERPER_API_KEY`（[serper.dev](https://serper.dev) 免费 2500 次/月）。

### 数据库初始化

按顺序在 Supabase SQL Editor 跑：

```text
sql/0001_initial.sql               # 核心表 + RLS
sql/0002_add_notes_column.sql      # places.notes
sql/0003_quick_add_drafts.sql      # 草稿表
sql/0004_add_photo_url.sql         # ⚠️ 已被 0005 取代，全新库跳过别跑（见文件头）
sql/0005_photo_urls_array.sql      # photo_urls text[]
sql/0006_llm_and_chat.sql          # user_llm_settings + conversations + messages
sql/0007_add_gemini_provider.sql   # gemini 加入 provider check
sql/0008_list_invites.sql          # list 共享邀请表 + RLS
sql/0009_storage_photos.sql        # photos storage bucket + RLS
sql/0010_list_members_policies.sql # ★ 修复邀请接受被 RLS 拒 + 改角色静默失效
sql/0011_invite_preview_function.sql # ★ 修复受邀者看邀请页显示「链接无效」
sql/0012_google_ratings_dishes.sql   # ★ Google 评分 + 招牌菜字段
sql/0013_photos_private.sql          # ★ photos bucket 转私有（⚠️ 先部署代码再跑，见文件头）
sql/0014_pick_sessions.sql           # 「一起选」双人滑卡决策（纯增量，先跑再部署）
sql/0015_push_subscriptions.sql      # Web Push 订阅表（纯增量，先跑再部署）
sql/0016_list_categories.sql         # 清单 category 吃/喝/玩/其他（纯增量，先跑再部署）
sql/0017_invite_privilege_escalation.sql # ★★ 安全：修邀请越权提权（⚠️ 先跑 SQL 再部署代码，见文件头）
sql/0018_fix_accept_invite_ambiguity.sql # ★★ 必跑：修 0017 函数的 42702，不跑则「接受邀请」失败
sql/0019_co_owner_rename_list.sql     # 共享清单的 co_owner 也能改名（纯增量）
sql/0020_harden_function_exposure.sql # 收紧函数暴露面（安全顾问）；纯加固，无业务变更
sql/0021_places_website_uri.sql       # places.website_uri（「看菜单」直达点单页）；纯增量
sql/0022_llm_usage_quota.sql          # 按用户每日 AI 配额（只在用 app 默认 key 时计）；纯增量
```

## 项目结构

```text
bite/
├── src/
│   ├── proxy.ts            # ⚠️ Auth session 刷新（Next.js 16 的 middleware，必须在 src/ 或仓库根）
│   ├── app/
│   │   ├── (app)/          # 登录后页面：lists / lists/[id]{,/pick,/places/…} / chat
│   │   │                   #   / map / stats / profile / quick-add{,/multi}
│   │   │                   #   / recommendations / invite/[token]
│   │   ├── (auth)/         # login / signup
│   │   ├── api/chat/       # SSE 流式聊天 + tool calling
│   │   ├── auth/callback/  # Supabase OAuth 回调
│   │   ├── globals.css     # Tailwind 4 入口 + 基础 token
│   │   └── v2.css          # 设计语言 token + 4 套主题（.ui-v2 作用域）
│   ├── components/
│   │   ├── auth/           # 登录/注册表单、Google 按钮
│   │   ├── chat/           # /chat 聊天 UI
│   │   ├── invites/        # 邀请按钮 / 活跃邀请面板 / 接受邀请
│   │   ├── lists/          # 清单 CRUD、成员面板
│   │   ├── map/            # 地图组件
│   │   ├── nav/            # bottom-nav
│   │   ├── places/         # quick-add 输入、确认表单、照片轮播/上传
│   │   ├── profile/        # 设置表单、主题选择、通知开关
│   │   ├── recommendations/# 推荐收件箱卡片
│   │   ├── ui/             # 图标
│   │   ├── v2/             # 主页 / 清单详情 / 店铺详情 / 一起选滑卡
│   │   └── visits/         # 我去了 + 造访历史
│   └── lib/
│       ├── actions/        # Server Actions —— 全应用唯一写入面
│       ├── auth/  chat/  client/  crypto/  db/  email/
│       ├── llm/            # provider 抽象（types+router）+ 工具 + 抽取
│       ├── places/         # XHS 抓取 + Google Places + 合并去重
│       ├── push/  quick-add/  ratelimit/  sql/  storage/
│       ├── supabase/       # server / admin client
│       ├── url/  util/  visits/
│       ├── theme.ts        # 主题常量（client-safe）
│       └── theme-server.ts # 服务端读主题 cookie
├── scripts/                # verify/ 子系统验证 + shoot/ 截图（见 scripts/README.md）
├── tests/e2e/              # Playwright
├── sql/                    # Postgres migrations（手工在 SQL Editor 跑）
├── public/                 # manifest.webmanifest / sw.js / icons/
└── .env.example            # 环境变量模板
```

## 当前状态

v1 全部主线功能已上线并在生产运行（`bite-sand.vercel.app`）：收集（统一输入框 / 拍照识店 /
小红书导入 / 合集帖分图）、决策（AI 聊天 tool calling / 决策中枢 / 一起选双人滑卡）、
记录（造访日志 / 足迹统计）、协作（共享清单 / 邀请 / 推荐收件箱 / Web Push）、
4 套主题 + 桌面响应式，以及吃/喝/玩多领域地基。

- **历史开发日志**（已冻结）：[`../docs/history/PHASE_PLAN.md`](../docs/history/PHASE_PLAN.md)
- **未决的架构分叉**：[`../docs/decisions/`](../docs/decisions/)
- 最新进展以 `git log` 为准

## 部署到 Vercel

完整可执行的上线 runbook（环境变量逐条对照源码、Supabase/Google OAuth 回调、Maps key
防盗刷、部署后冒烟测试清单）见 **[`DEPLOY.md`](./DEPLOY.md)**。

最关键的三点：

1. **Root Directory 选 `bite`**（app 在子目录，不是仓库根）
2. **`NEXT_PUBLIC_APP_URL` 填 Vercel 域名**后要重新 deploy（构建期注入），否则邮件链接指 localhost
3. **Google Maps key 加 HTTP referrer 限制**（`NEXT_PUBLIC_` 暴露在浏览器，不限制会被盗刷）

部署后第一次跑会比较慢（cold start）。Vercel 免费 tier 足够个人使用。

## 关键约定

- UI 文案**全中文**
- 服务端写入用 **Server Actions**，route handlers 仅 OAuth 回调 / SSE chat
- DB 权限走 **Supabase RLS**，应用层不重复鉴权
- 错误信息对用户友好（中文）
- Path alias `@/*` → `./src/*`
- 不要把 `.env.local` 提交（已 gitignore）
- 提交前跑 `npm run verify`（typecheck + lint + test + build）

详见 [`CLAUDE.md`](./CLAUDE.md) 和 [`AGENTS.md`](./AGENTS.md)。
