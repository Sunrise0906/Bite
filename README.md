# Bite

餐厅 / 玩乐记录 + AI 决策 + 多人协作。收集想去的店，吃完记一笔，
下次纠结「今晚吃什么」时让 AI 从你自己攒的库里挑。

**Next.js 应用在 [`./bite`](./bite)** —— Vercel 的 Root Directory 设为 `bite`。

```bash
cd bite && npm install && npm run dev
```

## 文档

| 文件 | 内容 |
| --- | --- |
| [`bite/README.md`](./bite/README.md) | 本地开发、环境变量、数据库迁移清单、项目结构 |
| [`bite/DEPLOY.md`](./bite/DEPLOY.md) | 上线 runbook（Vercel + Supabase + Google OAuth） |
| [`bite/CLAUDE.md`](./bite/CLAUDE.md) | 代码约定（AI agent 入口） |
| [`docs/SETUP.md`](./docs/SETUP.md) | 换机器 / 新环境准备 |
| [`docs/Bite_设计文档.md`](./docs/Bite_设计文档.md) | 原始产品设计 |
| [`docs/decisions/`](./docs/decisions) | 架构决策记录（ADR），含未决分叉 |
| [`docs/history/`](./docs/history) | 已冻结的历史开发日志 |

## 仓库布局

```text
Bite/
├── bite/          # Next.js 应用（开发主目录）
│   ├── src/       # 源码
│   ├── sql/       # Postgres migration（手工在 Supabase SQL Editor 跑）
│   ├── scripts/   # 验证脚本 + 截图脚本
│   └── tests/e2e/ # Playwright
└── docs/          # 产品设计、决策记录、历史归档
```
