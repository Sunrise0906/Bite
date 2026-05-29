# Bite 上线 Runbook · 复用现有 Supabase + 新建 Vercel

> 目标：把本地这套跑通的 app 部署到 Vercel，拉女朋友 / 朋友 dogfood。
> 数据库复用你现在本地连的 Supabase 项目（8 个 migration 都已跑过，含 `0008`）。
>
> ⚠️ dogfood 阶段复用 dev Supabase 没问题，但**正式对外前**建议另起一个生产 Supabase
> 项目（见 [§8](#8-正式对外前再做不影响-dogfood)），避免测试垃圾数据和真实数据混在一起。

---

## 1. Vercel 要设的环境变量（按代码实际读取整理）

下面这张表是**对照源码 grep 出来的**，不是照搬模板——只列代码真正读的。

| 变量 | 必须? | 说明 | 注意 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目地址 | `NEXT_PUBLIC_`：打包进前端，改了要重新 deploy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 匿名 key（RLS 兜底，可公开） | 同上 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ✅ | Places 补全 + 地图 | 同上；**暴露在浏览器，务必加 referrer 限制**（[§5](#5-google-maps-key-加限制防盗刷)） |
| `GOOGLE_PLACES_SERVER_KEY` | ✅ 生产必须 | 服务端 Place Details 拉取 | **不能** `NEXT_PUBLIC_`，只服务端用。若 NEXT_PUBLIC_ key 加了 referrer 限制（[§5](#5-google-maps-key-加限制防盗刷)），服务端调用无 Referer → Google 403；这把走"无 referrer 限制 + API 限制 + 预算告警"。dev 不填会回退到 NEXT_PUBLIC_ |
| `NEXT_PUBLIC_APP_URL` | ✅ | OAuth / 邮件回调基址 | 同上；**生产填 Vercel 域名**，否则验证邮件里的链接指向 localhost（[§3](#3-第一次部署--回填-next_public_app_url)） |
| `GEMINI_API_KEY` | ✅ 实际必须 | App 默认 LLM | 不是 `NEXT_PUBLIC_`，只在服务端用。**不配的话 /chat 对所有没自带 key 的用户都报错** |
| `ANTHROPIC_API_KEY` | ⬜ 可选 | 用户可在 Settings 选 | 不配就少一个 provider 选项，不影响主流程 |
| `OPENAI_API_KEY` | ⬜ 可选 | 同上 | |
| `DEEPSEEK_API_KEY` | ⬜ 可选 | 同上 | |
| `DASHSCOPE_API_KEY` | ⬜ 可选 | Qwen，同上 | |

**不要设的两个：**

- ❌ `SUPABASE_SERVICE_ROLE_KEY` —— **代码里零引用**（grep 确认）。它能绕过所有 RLS，
  设到 Vercel 纯属凭空多一个最危险的可泄露 secret 却没任何代码用它。等将来真有
  服务端 admin 操作需要再加。
- ❌ `NODE_ENV` —— Vercel 自动设成 `production`，手动设会出乱子。

> 填变量时 Environment 勾 **Production**（要也可勾 Preview）。`NEXT_PUBLIC_*` 是
> **构建期**注入的，事后改值必须触发一次新的 deploy 才生效。

---

## 2. 新建 Vercel 项目

1. Vercel → Add New → Project → 选这个 Git 仓库
2. **Root Directory 改成 `bite`** ← ⚠️ 最关键。app 在子目录，不是仓库根（仓库根只有
   `bite/` `docs/`）。选错会找不到 `package.json`。
3. Framework Preset 应自动识别为 **Next.js**；Build Command / Output 用默认即可（没有
   `vercel.json`，靠自动检测）。
4. 先把 [§1](#1-vercel-要设的环境变量按代码实际读取整理) 里**除 `NEXT_PUBLIC_APP_URL` 外**的变量填好
   （它的值要等下一步拿到域名）。`NEXT_PUBLIC_APP_URL` 先随便填个占位或留到第一次部署后补。

---

## 3. 第一次部署 → 回填 `NEXT_PUBLIC_APP_URL`

这里有个鸡生蛋：你要域名才能配 `NEXT_PUBLIC_APP_URL`，但域名要部署完才有。

1. 先 Deploy 一次，拿到 `https://<项目名>.vercel.app`。
2. 回 Settings → Environment Variables，把 `NEXT_PUBLIC_APP_URL` 设成这个域名（**不带结尾斜杠**）。
3. **Redeploy**（因为它是 `NEXT_PUBLIC_`，构建期注入，不重新部署不生效）。

> 如果一开始就想绑自定义域名，先在 Vercel → Domains 绑好，再直接用自定义域名填
> `NEXT_PUBLIC_APP_URL`，省一次来回。

---

## 4. Supabase 认证回调配置

代码里 OAuth / Magic Link / 注册验证邮件都重定向到
`${NEXT_PUBLIC_APP_URL}/auth/callback?next=...`。Supabase 那边要放行：

**Authentication → URL Configuration：**

- **Site URL** = `https://<你的域名>`
- **Redirect URLs** 加一行 `https://<你的域名>/auth/callback`
  （本地的 `http://localhost:3000/auth/callback` 一并留着，方便继续本地开发）

**如果要用 Google 一键登录**（代码已写 `signInWithOAuth`，但要配 provider 才生效）：

- Supabase → Authentication → Providers → Google：开启，填 Google OAuth Client ID / Secret
- Google Cloud Console → Credentials → 该 OAuth client → **Authorized redirect URIs** 填
  `https://<你的-project-ref>.supabase.co/auth/v1/callback`
  - ⚠️ **最容易配错的一步**：这里填的是 **Supabase 的回调地址**（`*.supabase.co/auth/v1/callback`），
    **不是**你的 app 域名。Google → Supabase → 你的 app，中间这跳是 Supabase 接的。

---

## 5. Google Maps key 加限制（防盗刷）

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 会出现在浏览器里，任何人都能扒走。不加限制 = 别人
拿你的 key 刷你账单。

Google Cloud Console → APIs & Services → Credentials → 该 key：

- **Application restrictions → HTTP referrers**：加 `https://<你的域名>/*`（和
  `http://localhost:3000/*` 方便本地）
- **API restrictions**：只勾 `Maps JavaScript API` + `Places API (New)`（按需加 Geocoding）
- Billing → 设个**预算告警**（比如 $5），刷爆前先收到邮件

> ⚠️ **加 referrer 限制后**，服务端 `fetchPlaceDetails`（quick-add 确认页拉店铺详情）
> 会被 Google 403：`Requests from referer <empty> are blocked`——服务端 fetch 没 Referer 头。
> 必须**另起一把服务端专用 key**：
>
> - GCP Console → Credentials → 新建 API key
> - **Application restrictions = None**（关键，不能设 referrer，否则同样被 403）
> - **API restrictions** = `Places API (New)` + `Geocoding API`（按需）
> - Billing 预算告警
> - 拿到 key 加到 Vercel Env Vars 作 `GOOGLE_PLACES_SERVER_KEY`（**不要** `NEXT_PUBLIC_`
>   前缀，别让它进浏览器 bundle），保存后会自动 redeploy

---

## 6. 部署前本地自查

```bash
cd bite
npx tsc --noEmit && npm run lint && npm run build   # 三个全绿才推
git status                                           # 确认 .env.local 没被 git 跟踪
```

- [ ] `tsc / lint / build` 全绿
- [ ] `.env.local` 不在 `git status` 里（应被 `.gitignore` 挡掉）
- [ ] 没有把任何真实 key 写进会被提交的文件（`.env.example` 只放占位）

---

## 7. 部署后冒烟测试（真机点一遍）

第一次真有用户碰它，按核心流程走一遍。每一项也顺带验证一个生产配置对没对：

- [ ] **注册新账号** → 收到验证邮件 → 点链接能回到 app　_（验证 `NEXT_PUBLIC_APP_URL` 对了）_
- [ ] **Google 登录**（若配了）能成功回跳　_（验证 §4 回调）_
- [ ] `/lists` 建一个 list
- [ ] `/quick-add` 粘一条小红书链接 → AI 抽取 → 保存成功
- [ ] `/quick-add` 输入框搜店名 → 出**本地**结果 + 距离　_（验证 Maps key + referrer）_
- [ ] `/chat` 问一句 → AI 流式回复出来　_（验证 `GEMINI_API_KEY` 生效）_
- [ ] `/map` 能看到 marker
- [ ] 某家店点「我去了」记一次
- [ ] **邀请链接**：list 里生成 → 用另一个账号打开 → 能加入
- [ ] **推荐给朋友**：填对方邮箱发出 → 对方 `/recommendations` 收得到
- [ ] **PWA**：手机浏览器「添加到主屏幕」，图标 + 启动页正常　_（SW 只在生产注册，这是它首次上线）_

---

## 8. 正式对外前再做（不影响 dogfood）

现在为了快，复用 dev Supabase + 没有邮件通知。dogfood 没问题，但要更多人用之前：

- **独立生产 Supabase 项目**：新建一个，按 `sql/0001` → `0008` 顺序重跑 migration，
  Vercel 的 Supabase 三个变量换成生产项目的。dev 的测试垃圾数据就不会混进来。
- **生产 LLM key 独立 + 预算监控**：dogfood 人多了 Gemini 免费额度（15 RPM）可能不够。
- **邮件通知缺口**：当前推荐 / 邀请**全靠对方主动开收件箱**，没有邮件推送。dogfood 时
  先口头提醒"我推了家店给你，去 /recommendations 看"。这是 P1 待办（接 Resend）。

---

## 附：env 变量速查（复制到 Vercel）

```
# 必须
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
GOOGLE_PLACES_SERVER_KEY=       # 生产 + NEXT_PUBLIC_ 已加 referrer 限制时必须
NEXT_PUBLIC_APP_URL=            # = https://<你的域名>，不带结尾斜杠
GEMINI_API_KEY=

# 可选 provider（不填也能跑，用户默认走 Gemini）
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
# DEEPSEEK_API_KEY=
# DASHSCOPE_API_KEY=

# 不要设：SUPABASE_SERVICE_ROLE_KEY（代码没用）、NODE_ENV（Vercel 自动）
```
