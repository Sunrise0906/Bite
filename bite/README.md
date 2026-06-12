# Bite

餐厅记录 + AI 决策 + 多人协作 web app。

完整产品设计：[`../docs/Bite_设计文档.md`](../docs/Bite_设计文档.md)

## 技术栈

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** + **Tailwind 4**
- **Supabase**（Postgres + RLS + Auth + Storage）
- **多 LLM provider**：Google Gemini（默认免费）/ Anthropic Claude / OpenAI GPT / DeepSeek / 通义千问 Qwen
- **地图**：Google Maps + Places API (New)
- **邮件**：Supabase 默认邮件服务（注册验证 / Magic Link）。生产想要更可靠 + 自家域名发件可接 Resend / SendGrid

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

可选（生产邮件，自家域名发件更专业）：

- 配 Resend / SendGrid SMTP 到 Supabase Auth → Email Settings；当前代码用 Supabase 默认邮件，足够开发 + 小流量使用

> 注：`SUPABASE_SERVICE_ROLE_KEY` 当前代码**未使用**（写入全走 RLS + anon key），无需配置。将来若加服务端 admin 操作再补。

### 数据库初始化

按顺序在 Supabase SQL Editor 跑：

```text
sql/0001_initial.sql               # 核心表 + RLS
sql/0002_add_notes_column.sql      # places.notes
sql/0003_quick_add_drafts.sql      # 草稿表
sql/0004_add_photo_url.sql         # photo_url (superseded by 0005)
sql/0005_photo_urls_array.sql      # photo_urls text[]
sql/0006_llm_and_chat.sql          # user_llm_settings + conversations + messages
sql/0007_add_gemini_provider.sql   # gemini 加入 provider check
sql/0008_list_invites.sql          # list 共享邀请表 + RLS
sql/0009_storage_photos.sql        # photos storage bucket + RLS
sql/0010_list_members_policies.sql # ★ 修复邀请接受被 RLS 拒 + 改角色静默失效
```

## 项目结构

```text
bite/
├── src/
│   ├── app/
│   │   ├── (app)/          # 登录后可访问页面：lists / chat / map / profile ...
│   │   ├── (auth)/         # login / signup
│   │   ├── api/chat/       # SSE 流式聊天 + tool calling
│   │   ├── auth/callback/  # Supabase OAuth 回调
│   │   └── globals.css     # Tailwind 4 入口 + 主题 token
│   ├── components/
│   │   ├── chat/           # /chat 聊天 UI
│   │   ├── lists/          # list CRUD
│   │   ├── map/            # 地图组件
│   │   ├── nav/            # bottom-nav
│   │   ├── places/         # PlaceCard / quick-add / 照片轮播
│   │   ├── profile/        # /profile Settings 表单
│   │   └── visits/         # 我去了 + 造访历史
│   └── lib/
│       ├── actions/        # Server Actions（写库走这里）
│       ├── db/             # 类型定义 + 聊天持久化
│       ├── llm/            # provider 抽象 + 工具 + 抽取
│       ├── places/         # XHS 抓取 + Google Places
│       ├── quick-add/      # 输入类型识别
│       └── supabase/       # client/server helpers
├── public/
│   ├── manifest.webmanifest
│   └── icons/
├── sql/                    # Postgres migrations
├── proxy.ts                # Auth session 刷新（Next.js 16，不是 middleware）
└── .env.example            # 环境变量模板
```

## Phase 进度

| Phase | 状态 | 内容 |
| --- | --- | --- |
| 1 · 地基 | ✅ | Next.js + Supabase + Auth + List/Place CRUD |
| 2 · 智能添加 | ✅ | 统一输入框 + AI 抽取 + Google Places + 小红书富抽取 + 多图 + 搜索 |
| 3 · AI 决策聊天 | ✅ | 流式 chat + tool calling + 多 provider + 顶栏/复制/时间戳/重新生成/用量 |
| 4 · 我去了 + 地图 | ✅ | VisitLog CRUD + 我去了按钮 + 造访历史 + chat 信号 + Google Maps |
| 5 · 协作 + 收尾 | 🚧 | PWA / 共享 list / 推荐 inbox / Vercel 部署 |

参见 [`PHASE_PLAN.md`](./PHASE_PLAN.md) 看每个 phase 的具体待办。

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
- 不要把 `bite/note` / `.env.local` 提交（已 gitignore）

详见 [`CLAUDE.md`](./CLAUDE.md) 和 [`AGENTS.md`](./AGENTS.md)。
