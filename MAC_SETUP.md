# Bite · 换到 Mac 继续开发

> 交接文档。生成于 2026-07-30，对应 commit `0304531`。

## 0. 这个包里有什么

```
IrvinePlay/
├── bite/                 # Next.js app（开发主目录）
│   ├── src/              # 全部源码
│   ├── sql/              # 16 个 Postgres migration（云端已全部跑完）
│   ├── design-preview/    # 设计原型 HTML + 验证/截图脚本
│   ├── .env.local        # ⚠️ 真实密钥，已包含（git 里没有这个文件）
│   └── ...
├── docs/Bite_设计文档.md   # 原始产品设计文档
├── .git/                 # 完整提交历史，可直接 push
└── MAC_SETUP.md          # 本文件
```

**没包含**（Mac 上重新生成）：`node_modules/`、`.next/`、`test-results/`、
design-preview 的 60 张验证截图。

> ⚠️ **这个压缩包含真实 API 密钥**（`bite/.env.local`）。别传到公开云盘链接、
> 别发群、别提交进 git（已 gitignore）。传输走 AirDrop / U 盘 / 私有云盘。

---

## 1. 环境准备（Mac）

```bash
# Node 22+（Windows 上用的是 v22.20.0）
brew install node        # 或 nvm install 22 && nvm use 22
node -v                  # 应 ≥ 22

cd IrvinePlay/bite
npm install              # ~527MB node_modules，2-3 分钟

# Playwright 浏览器（跑 e2e / 截图脚本才需要）
npx playwright install chromium
```

## 2. 起项目

```bash
cd bite
npm run dev              # → http://localhost:3000
```

登录用 `.env.local` 里的 `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`，或你自己的账号。

## 3. 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（Turbopack） |
| `npm test` | 239 个单元测试（vitest，~2 秒） |
| `npx tsc --noEmit` | 类型检查 |
| `npm run lint` | ESLint |
| `npm run build` | 生产构建（提交前必跑） |
| `npm run test:e2e` | Playwright e2e（默认打生产站） |
| `E2E_BASE_URL=http://localhost:3000 npx playwright test` | e2e 打本地 |

**验证脚本**（都在 `bite/design-preview/`，需要 dev server 在跑）：

```bash
node design-preview/shoot-themes.mjs          # 4 主题 × 手机/桌面截图
node design-preview/test-pick-duo.mjs         # 「一起选」双人匹配流（打生产站）
node design-preview/verify-signed-render.mjs  # 照片签名 URL 不变量
VERIFY_BASE=https://bite-sand.vercel.app node design-preview/verify-signed-render.mjs
```

## 4. Windows → Mac 的差异

- **杀端口**：Windows 用 `taskkill /PID`，Mac 用 `lsof -ti:3000 | xargs kill -9`
- **行尾**：仓库里有 CRLF/LF 混用（Windows git autocrlf 的产物）。Mac 上如果 diff
  出现大量"整文件改动"，跑 `git config core.autocrlf input` 后重新 checkout
- **脚本兼容**：`design-preview/*.mjs` 是纯 Node，跨平台无差异
- 项目里没有任何 Windows 专属依赖或路径硬编码

## 5. 云端资源（不需要在 Mac 上重建）

| 资源 | 状态 |
| --- | --- |
| Supabase（数据库 + Auth + Storage） | 已上线，16 个 migration 全跑完 |
| Vercel（生产部署） | bite-sand.vercel.app，push 到 main 自动部署 |
| GitHub | github.com/Sunrise0906/Bite，main 已同步 |
| Google OAuth | 已配置可用 |
| photos storage bucket | 已私有化（signed URL 渲染） |
| Web Push（VAPID） | 已配置（本地 + Vercel env） |

`.env.local` 和 Vercel 环境变量已经一致，**唯一可选缺项**：`SERPER_API_KEY`
（站内小红书搜索板块，见第 7 节）。

## 6. 项目当前状态（2026-07-30）

**质量**：239 单测 ✅ / tsc ✅ / lint ✅ / build ✅ / e2e 9/9 ✅，工作树干净。

**已上线的功能**：

- **收集**：统一输入框（店名搜索 / 小红书链接 / 长文本 / 合集帖多店分图）、
  拍照识店（菜单/店面/截图 → vision 抽取）、语音输入、Google 自动 enrich
  （评分+坐标）、XHS 图片自动转存（防链接过期）
- **决策**：AI 聊天（tool calling：查库 / 看详情 / 找相似 / 加店，读造访信号和
  招牌菜）、主页决策中枢、想去 deck、**一起选**（双人滑卡，都右滑 → 匹配）、
  实时营业状态、一键看菜单、小红书搜这家
- **记录**：造访日志（🔥/👍/👎 + 星级 + 照片 + 同伴）、重访预填、造访照片展示、
  **/stats 吃喝足迹**（KPI + 菜系分布 + 近 6 月趋势）
- **协作**：共享清单（co-owner/viewer）、邀请链接、多人各写理由、推荐收件箱、
  **Web Push 通知**（推荐/邀请/新店/匹配四个触发点）
- **外观**：V1/V2 双版本 + **4 套完整设计语言主题**（陶土/深夜食堂/鲜果软糖/
  净白画廊）+ 桌面响应式（左侧栏 + 多列）+ 暗色模式
- **多领域地基**：清单分 吃/喝/玩/其他，AI 已能跨领域组合查询

**架构要点**（详见 `bite/CLAUDE.md`）：

- Next.js 16（`proxy.ts` 而非 middleware；cookies/params 全 async）+ React 19 + Tailwind 4
- 写库走 Server Actions；权限全靠 Supabase RLS
- 多 LLM 抽象（`src/lib/llm/`）：Gemini 默认免费，可切 Claude/GPT/DeepSeek/Qwen
- 照片：DB 只存 canonical URL，渲染层换 7 天 signed URL（`lib/storage/signed-photos.ts`）
- 主题：`v2.css` 全 token 化，`.ui-v2.theme-*` 覆写；V1 token 桥接到 `--v2-*`

## 7. 待办 / 下一步

**可选配置**（3 分钟，点亮已写好的功能）：

1. [serper.dev](https://serper.dev) 注册免费 key（2500 次/月）
2. `bite/.env.local` 加 `SERPER_API_KEY=xxx`
3. Vercel → Settings → Environment Variables 加同一条 → Redeploy

→ 详情页会出现「小红书 · 关于这家店」板块：相关帖子卡片 + 一键导入
（抓帖 → AI 抽取 → 合并招牌菜/图片/口碑备注进这家店）。

**商定的路线图**：

1. **位置感知决策** — 把"离我最近的想去"接进聊天工具和主页排序
   （坐标 + 浏览器定位基建都已就绪）
2. **activity 抽取适配** — 玩乐店该抽 类型/时长/门票/适合人群，而不是菜系/人均
3. **约会行程规划师** — 跨领域组合卡："午餐 A → 咖啡 B → 日落步道 C"，
   可保存可分享（多领域地基已打好，这是"从吃到玩"的门面功能）
4. **iOS App** — web 功能稳定后用 Capacitor 之类的壳打包，解决"分享到 Bite"
   （iOS PWA 不支持 Share Target，所以 web 端不做这个）

**未验证项**：Web Push 的真机收信（需真手机开通知后互发一条推荐验证）。

**已知小事**：小红书 CDN 老图会 403（新加的店已自动转存，老图可考虑写个
一次性抢救脚本）；`bite/note` 里有明文密钥副本（已 gitignore，建议删掉，
`.env.local` 已包含所有需要的值）。

## 8. 如果不用这个压缩包

代码全在 GitHub，也可以直接 clone —— 只需单独把 `bite/.env.local` 拷过去：

```bash
git clone https://github.com/Sunrise0906/Bite.git
cd Bite/bite
# 然后把 .env.local 用 AirDrop 传过来放这里
npm install && npm run dev
```
