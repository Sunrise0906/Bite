# Bite

餐厅记录 + AI 决策 + 多人协作 web app（个人项目，工作名 "Bite"，最终命名可后期替换）。

完整产品设计：[`../docs/Bite_设计文档.md`](../docs/Bite_设计文档.md)

## 技术栈

- **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind 4**
- **Supabase**（Postgres + RLS + Auth + Storage）
- **LLM**：Anthropic Claude（默认），可切换 OpenAI / DeepSeek / Qwen
- **地图**：Google Maps + Places API (New)
- **邮件**：Resend（注册验证 / Magic Link）

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填入真实 key
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 项目结构

```text
bite/
├── src/
│   ├── app/             # Next.js App Router 页面
│   │   └── globals.css  # Tailwind 4 入口 + 主题 token
│   ├── lib/             # Supabase / LLM / 工具函数（开发中）
│   └── components/      # 复用组件（开发中）
├── public/              # 静态资源
├── proxy.ts             # Auth session 刷新（Next.js 16 重命名自 middleware）
└── .env.example         # 环境变量模板
```

## 必备 API key

详见 [`.env.example`](.env.example) 的注释。开发期最低成本：Anthropic $5 + Supabase 免费 tier + Google Cloud 免费额度（$200/月）+ Resend 免费 tier。

## 阶段计划（15 天 MVP）

| Phase | 状态 | 内容 |
| --- | --- | --- |
| 1 · 地基 | 🚧 | Next.js + Supabase + Auth + List/Place CRUD |
| 2 · 智能添加 | ⏳ | 统一输入框 + AI 路由 + Google Places + 小红书文本解析 |
| 3 · AI 决策聊天 | ⏳ | 聊天 UI + tool calling + 多 LLM provider |
| 4 · 我去了 + 地图 | ⏳ | VisitLog + 累积统计 + 地图视图 |
| 5 · 协作 + 收尾 | ⏳ | Co-owner 邀请 + 推荐 + PWA + Vercel 部署 |

## 部署

待 Phase 5。Vercel 一键部署，环境变量在 Vercel Dashboard 配置。
