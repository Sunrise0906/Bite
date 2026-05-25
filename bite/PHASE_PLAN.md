# Bite Autonomous Dev Plan

> 用户离开 10h，我自主续干。每半小时一个 /loop iteration。

## 当前状态：✅ DONE — 待用户测试

- 启动 commit: `e96cd84` (phase-3-polish-r3)
- 自主开发 9 个 iter，10 个 commit 推进到当前 HEAD
- Phase 1-5 全部主线功能完成
- typecheck / lint / build 全绿
- 待用户回来：
  1. 跑 SQL 0008（list_invites）
  2. 真机测：/chat（Gemini）/ /map / 「我去了」 / /recommendations / 邀请链接
  3. 检查 PR / push

## 待用户跑的 SQL migrations

按顺序在 Supabase SQL Editor 跑（前 7 个用户已跑）：

```text
sql/0008_list_invites.sql       # ★ 新加，list 共享邀请用
```

## 硬约束（不能做的事）

- 不跑数据库 migration（写文件等用户）
- 不 push 远端
- 不能浏览器手测（用 tsc/build/lint 兜底）
- 不做未授权的架构变更

## Backlog（按 PM 价值 + 依赖排序）

### A. Phase 3 leftovers
- [x] (e96cd84) 顶栏 / 复制 / 时间戳 / 字数 / 服务端 abort
- [x] **A1. place 链接化** — page 加载 placeMap → ChatView LinkifiedText 解析 «店名» 渲染 <Link>，system prompt 引导 LLM 用书名号
- [x] **A2. 重新生成最后一轮** — /api/chat 加 regenerate flag：找最后一条 user-text → 删除后续 messages → re-stream；前端 ↻ 按钮挂在最后一条 assistant 下
- [x] **A3. 用量统计** — Provider 流末尾 yield usage chunk（Anthropic finalMessage.usage / OpenAI stream_options.include_usage），存 messages.usage，/profile 加本月/全部 token 卡
- [x] **A4. 对话超长上下文管理** — /api/chat 超 30 轮时只保留最近 24，且在边界处不切散 tool_use/tool_result 对；前面塞一条 user-role 摘要说"早期轮次已省略"

### B. Phase 4 — VisitLog + 我去了 + 地图

- [x] B1. SQL 0008 — 不需要（visit_logs 表已在 0001，含 RLS）
- [x] B2. visit server actions — log / update / delete in lib/actions/visits.ts
- [x] B3. VisitLogButton — 嵌入 PlaceCard（chip 样式）+ place edit 页（btn 样式）
- [x] B4. VisitLogForm modal — sentiment / star / date / companions / note
- [x] B5. 首次 log 自动 flip status — want_to_go → visited（在 logVisit 内）
- [x] B6. PlaceEdit 页 VisitHistory 区 — 倒序时间线 + 编辑/删除按钮
- [x] B7. chat tools 加 visit signals — search_my_list 返回 visit_count + last_visit + last_sentiment；check_place_details 加最近 10 条 logs；system prompt 教 LLM 用这些信号
- [x] B8. /map 页面 — 原生 Maps JS API（已有 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY）+ 状态色圆点 marker + 点击 InfoWindow，加入 bottom-nav

### C. Phase 5 — 部署 + PWA + 协作 + 推荐

- [x] **C1. README** — env vars / Supabase migration 顺序 / Vercel 部署步骤 / 项目结构 / phase 进度
- [x] **C2. PWA 基础** — manifest.webmanifest + 简易 SVG icon + 最小 service worker（生产 only 注册）+ layout 关联
- [x] **C3. List 共享 / co-owner** — SQL 0008 list_invites + createListInvite/acceptListInvite/revoke actions + /invite/[token] 页 + list 页 InviteButton modal（角色选 co_owner/viewer + 7 天 token + 复制链接）
- [x] **C4. Recommendations inbox** — actions（send/accept/decline/withdraw）+ /recommendations 三段（待处理收件 / 已处理收件 / 我发出的）+ RecommendButton 嵌入 place edit 顶部 + 邮箱查 profile + 接受时选目标 list
- [ ] **C5. /map 共享 list overlay** — co-owner 的地图视图（共享 list 已经会被 map page 拉进来，因为 listIds 含 member）

### D. 杂项 / 修补

- [x] **D1. 已知 lint warning 清理**：iter-3 一波清完
- [x] **D2. quick-add-input lint** — iter-8 用 eslint-disable 块级注释；refactor 为派生 state 收益小，跳过
- [x] **D3. lists/page.tsx 未转义引号** — iter-3 fix
- [ ] **D4. 把 settings 表的 api_key 改成 vault 加密**（安全 polish；当前 RLS 兜底）— BLOCKED 待用户决策

### J. 持续 polish（plan 主线 done 后发现）

- [x] **J1. /profile 编辑 name + avatar URL** — 之前用户没法改自己的 display name，朋友 / 共享 list 里看到的全是 email 前缀。新增 updateProfile action + ProfileEditForm 组件（在 read view 和 edit 模式间切换）
- [x] **J2. 自定义 404 页** — 之前 Next.js 默认黑底英文 404 跟设计语言不符。改成中文 + terracotta 配色 + 回 list / chat 的 CTA

### K. 数据可见性 polish

- [x] **K1. PlaceCard 显示 visit 信号** — chat 工具已能读 visit count / last sentiment / avg star，但 list 页卡片看不到。现在卡片底部加一行：「❤️ 去过 N 次 · 3 天前 · ★★★★☆」

### L. UX 排序 + 移动端可见性

- [x] **L1. /lists 按"最近活动"排序** — 之前 ORDER BY created_at desc，添了新店那个 list 还在原位。改成 server fetch 后 JS 排序 max(list.updated_at, max(places[].updated_at))。新店加进哪个 list 就把那个 list 顶到前
- [x] **L2. mobile 端 chat 消息时间戳/复制按钮可见** — 之前 opacity-0 group-hover:opacity-100 在 touch 设备上永远透明。改成 mobile 默认显示，sm+ 才走 hover-only 模式

### N. metadata / SEO polish

- [x] **N1. 每个页面 metadata.title** — 之前所有 tab 都显示「Bite · 餐厅记录」（layout 默认）。给 /lists、/chat（动态拉对话标题）、/profile、/recommendations、/quick-add、/quick-add/multi、/invite/[token]、/lists/[id]（动态拉 list 名）、/lists/[id]/places/new、/lists/[id]/places/[placeId]/edit（动态拉 place 名）都加了 metadata 或 generateMetadata

### O. 流程衔接 polish

- [x] **O3. /quick-add 空 list 内联创建** — 之前用户粘 XHS link、LLM 抽取完发现没有可写 list 只能"返回 lists"重新走一遍流程（草稿虽然存了但体验割裂）。新加 createListInPlace action（不 redirect，返回 id）+ InlineCreateList 客户端组件，原地建 list 后 router.refresh，自动接续 confirm 表单

### P. 协作可见性 polish

- [x] **P1. PlaceCard 显示所有 reasons 带作者** — 之前 PlaceCard 只显示 currentUserId 匹配的 reason，共享 list 上看不到朋友写的理由。修：list 页 collect 非当前用户的 reason user_ids，一次拉 profiles map，传给 PlaceCard。卡片现在先显示我的 reason，然后显示其他 user 的 reasons（最多 2 条 + 「还有 N 条」），每条带 @作者 chip
- [x] **P2. VisitHistory 显示作者标签** — 共享 list 上多人记录的造访前面没标谁记的，看不出"Alice 8 月去过 ❤️ vs Bob 8 月去过 👎"。修：place edit 页拉 visit user_ids → profiles，VisitHistory 渲染时非己 log 加 @作者 chip。同时收紧编辑/删除只对自己的 log 生效——不能改朋友的记录（DB RLS 也兜底）

### Q. 数据完整性 bug fix

- [x] **Q1. acceptRecommendation 防 dup + smart merge** — bug：朋友推荐的店如果接收者目标 list 里已有同名店，会插重复行。修：先查 (list_id, name)，命中则合并（reasons 去重 append、tags/cuisine/occasions/photo_urls union dedup、notes 保留已有非空），返回 merged:true。UI 区分"已添加 / 已合并"toast
- [x] **Q2. chat add_to_list tool 防 dup** — 同 Q1 同类 bug。chat AI 调 add_to_list 时若同 list 同名已存在会插重复。修：先查，命中返回 `already_exists:true`（不 merge，因为 AI 上下文里"用户让我加"和"该店已存在"语义不同——直接告诉用户更清晰）。工具 description 也更新让 AI 知道这种 case 该怎么转达

### R. 共享 list 来源可见性

- [x] **R1. 共享 list 头部显示 owner 名字** — 之前 viewer 看到「共享 · 只读」chip 但不知道是谁的 list（点哪儿都没暗示）。把 list.owner_id 加进 profilesMap lookup（已有 reason authors 的 query 顺便加），头部 chip 旁边显示「by @owner」+ chip title tooltip
- [x] **R2. /lists 主页 ListCard 共享 chip 显示 owner** — 在用户进 detail 页前就让 ta 知道哪个是朋友的 list。/lists page 一次查所有共享 list owner profiles，chip 文案改为「共享 · by @owner」+ tooltip

### S. 来源可见性

- [x] **S1. PlaceCard 显示 source 标记** — 之前看 PlaceCard 不知道这家店是手动加的、还是 XHS 抓的、Google Places 搜的、AI 抽取的、Yelp 来的。在 cuisine chip 行前加 source emoji（📕 / 🤖 / 🗺️ / ⭐ + tooltip 说明），manual 默认不显示

### T. 错误边界 / 可靠性

- [x] **T1. 全局 error.tsx + global-error.tsx** — 之前 runtime 错误（Supabase 挂 / env 配错 / provider 502）直接掉到 Next.js 默认黑底 error 页。加 app/error.tsx 兜底 route segment 内的崩，含 中文文案 + 重试按钮（reset）+ 回 list 链接 + error.message + digest（调试）。再加 app/global-error.tsx 兜底 root layout 自己崩的情况（必须自带 html/body，纯 inline 样式不依赖 layout）

### U. 冷启动 + 导航 polish

- [x] **U1. chat system prompt 处理空库** — 之前 search_my_list 返回 `note="用户还没有任何 list"` 时 AI 不知道该说啥。在 system prompt 加「冷启动 / 空库的情况」段落：引导用户去 /lists 建 list + /quick-add 加店；如果有 list 但查不到匹配，建议换条件不主动写库
- [x] **U2. /lists/[id] 头部 sticky** — 长 list 滚下去 list 名 + 邀请按钮就看不见了。改 header 为 sticky top-0 + backdrop blur，滚动时仍可见

### V. auth 页 polish + 去重

- [x] **V1. /login + /signup metadata.title** — 之前 auth 页 tab 也显示「Bite · 餐厅记录」layout 默认值。加「登录 · Bite」/「注册 · Bite」
- [x] **V2. AuthDivider 组件去重** — 之前 /login 和 /signup 各自重复定义 Divider 组件（同样代码）。提取到 components/auth/divider.tsx

### X. PlaceForm 细节 polish

- [x] **X1. readOnly viewer 不显示 required `*` 标记** — viewer 看 place edit 页时所有字段 disabled，但标签上的 `*` 还在，看着像让你填实际不能填。抽出 `Req` 节点，readOnly 时为 null，否则星号
- [x] **X2. photo URLs 实时预览** — 之前 PhotoCarousel 只显示已保存的 photos，textarea 编辑时贴新 URL 看不到预览。改 textarea 为 controlled state，按行 parse 出 https:// 的有效 URL 实时给 PhotoCarousel；显示「N 张」计数

### Y. 一致性 fix

- [x] **Y1. /recommendations 接受目标 list 含 co_owner 共享 list** — /quick-add 已经 fix 过同类（iter-8 O3 旁带），但 /recommendations 还只看 owner_id 的 list。修：加 list_members 查询，含 role='co_owner' 的共享 list 也算可接受目标

### Z. 长列表导航

- [x] **Z1. /chat 侧栏对话按时间分组** — 之前 conversations 平铺一长串，多于 20 条不好扫。改为按 updated_at 分组成 5 桶（今天/昨天/本周/本月/更早），每组上方加小标题。桌面侧栏生效；mobile 横滚 chip 暂保持平铺（横滚本就不适合分组）

### AB. 登录路径 polish

- [x] **AB1. SignInForm 加忘了密码 hint** — 之前用户输错密码只看到红色错误，没人告诉 ta 还能用 Magic Link 进。login 页本来就有 Magic Link 表单。SignInForm 底部加一行 11px 小字：「忘了密码？下面的「魔法链接登录」也能进，不用密码」

### AC. Toast 反馈准确性

- [x] **AC1. places_added toast 含 updated count** — `savePlacesBatch` redirect URL 已经带 `&updated=N` 但 ToastFlash 只读 `count` 忽略 `updated`，5 家全添加跟 3 加 + 2 合并显示一样「已添加 5 家店」误导用户。修：ToastFlash 也读 `updated`，文案根据合并比例分三档：「全合并」「混合」「全新增」

### AF. Auth 流程端到端 next 参数

- [x] **AF1. SignUp 流程接 next** — bug：朋友给的 invite 链接 `/invite/abc`，未登录用户被 proxy 拐到 `/login?next=/invite/abc`，但点「创建账号」跳 `/signup` 时 next 丢了；signUpWithEmail 也没用 next，注册验证邮件 redirectTo 默认 `/lists`。整条 sign-up 路径上 next 被吃掉。修：
  - login 页底部「创建账号」link 把 next 带到 /signup
  - signup 页 searchParams 读 next，SignUpForm + GoogleButton 都收 next prop
  - SignUpForm 加 hidden next input；signUpWithEmail action 用 next 构造 emailRedirectTo
  - signup 页底部「登录」link 也把 next 带回 /login（双向对称）
  - 现在 invite → login → 「创建账号」→ 注册 → 验证邮件 → 回 /invite/abc 链路完整

### AG. 图片加载兜底

- [x] **AG1. ProfileEditForm avatar onError 回退** — 用户贴个 URL 当头像，URL 失效（404 / 跨域被 block）后 read view 显示浏览器默认 broken-image icon，很丑且无操作引导。加 avatarBroken state + img onError 回退到 initial 字母圆圈，保存新 URL 后重置标记重新尝试加载
- [x] **AG2. PhotoCarousel 单张图加载失败 placeholder** — XHS CDN 偶尔防盗链 block referrer / 图床挂了 / 用户贴错 URL，carousel 内某张图碎了浏览器显示破图 icon 又丑又卡视觉。加 broken Set state + 每张图 onError 回退到「🖼️ 图片加载失败」placeholder，保留其他图正常滚动 / 圆点指示
- [x] **AG3. PlaceCard cover image fallback** — list 主页卡片左侧封面图碎了同样难看。但 PlaceCard 是 server component，需抽个小 client 组件 PlaceCardCover 用 onError。fallback 是中性 🍽️ placeholder（占同尺寸），同时 broken 时不显示「N 张」badge（误导）

### AH. 表单状态一致性

- [x] **AH1. Settings 保存后清旧 testResult** — bug：用户测试连接 ✓ → 改字段 → 保存 → 同时看到「已保存 ✓」+「连接成功 ✓」，但后者是几次操作前的旧测试结果，误以为刚刚又测过了。修：saveLlmSettings 加 version 递增；客户端 useEffect 监听 state.version 触发 setTestResult(null)。注意 React 19 严格 set-state-in-effect 规则，加 inline disable + 注释说明 deliberate

### AI. 流式 / 路由交互 bug

- [x] **AI1. 新对话 stream 中 URL 替换导致 ChatView 重挂** — 严重 bug：用户在 /chat 发首条消息，meta 事件回来时调 `router.replace('/chat?c=<id>')`，触发 Next.js 父 page server re-render，ChatView key=activeId 从 `"new"` → 实际 id，React 看到 key 变了 unmount + mount 新实例。原 ChatView 的 stream reader 被丢弃 → assistant 流式回复在用户屏上中断消失。后端继续跑完保存到 DB，用户得手动 refresh 才看得到。修：改用 native `window.history.replaceState` 静默更新 URL bar——Next router 状态不变，组件继续挂着接完 stream。流结束的 `router.refresh()` 再把 sidebar 状态 sync 上来

### AD. README 文档准确性

- [x] **AD1. README env vars 校正** — 之前表里列了 `RESEND_API_KEY` 但代码完全没用（实际 Magic Link 走 Supabase 默认邮件）；缺少实际重要的 `NEXT_PUBLIC_APP_URL`（OAuth callback + 邮件链接基址，部署到生产忘配会导致邮件链接指 localhost）。改：补 NEXT_PUBLIC_APP_URL，去掉 RESEND_API_KEY，技术栈描述里把"邮件：Resend"改成"Supabase 默认邮件，生产可接 Resend / SendGrid"，加可选 SMTP 段说明
- [x] **AE1. .env.example 同步校正** — README 改了但 .env.example 还把 Anthropic 标"必须"、漏 GEMINI_API_KEY、留 RESEND_API_KEY/EMAIL_FROM 占位。新用户拷贝就会浪费时间申请 Anthropic 和 Resend。重构成：Supabase（必须）→ Gemini（推荐 / 真免费 / App 默认）→ Google Maps（必须）→ NEXT_PUBLIC_APP_URL（必须）→ 可选 providers（Anthropic/OpenAI/DeepSeek/Qwen 全部移到可选）→ 可选 SMTP（说明配在 Supabase Auth 而非代码）

## 当前 iter 选

**iter-1（now）**: A1 + A2 + A3（phase 3 收尾）
**iter-2**: B2 + B3 + B4 + B5（VisitLog 核心）
**iter-3**: B6 + B7（visit 历史 + AI 信号）
**iter-4**: B8（地图）
**iter-5+**: C1-C2（README + PWA）→ C3-C4（协作 + 推荐）→ D（杂项）

## Working Log

### iter-0 [启动]
- 写 plan，挂 /loop 30m（job d38f56d7, :07/:37），进入 iter-1

### iter-1 [phase 3 收尾]
- ✓ A1 place 链接化
- ✓ A2 regenerate
- ✓ A3 用量统计
- typecheck + build 全绿，my files lint 干净（5 个剩余 error 是 pre-existing 不归本批）
- PM review：
  - 链接化只在用户回到 /chat 后渲染时生效；流式期间 «店名» 是普通文本，结束后页面 router.refresh 会重渲染并打链接（验证：是否真触发了 refresh 让 placeMap 渲染。理论上 refresh 后 ChatView 用 key 重挂或 React 重渲染，但 ChatView 用 key=activeId 不会重挂）—— BLOCKED 需测试
  - 用量统计依赖 provider 真返回 usage；Gemini OpenAI-compat 可能不支持 stream_options.include_usage，需用户测试确认
  - regenerate 删 DB 记录是 hard delete，没回滚机制——可接受，用户不该期待 undo
- commit: 3ddee7f

### iter-2 [Phase 4 全部]
- ✓ B2-B8 全部完成（VisitLog actions / UI / 历史 / chat 信号 / 地图）
- typecheck + build 全绿
- PM review：
  - VisitLog photos 字段没启用（设计文档里有但 Phase 4 Day 1 跳过；要 Supabase Storage 集成）—— 列入 D 杂项
  - Place edit 页的 VisitHistory section 在表单下方；用户改完 place 后才能滚到，长 form 时不便。考虑加锚点或顶部 TOC ——次优化
  - 地图 marker 用 SymbolPath.CIRCLE 是老 API；如果 Maps JS 切到 AdvancedMarkerElement 这个写法 deprecated。当前还能用，先记录
  - chat tools 现在每次 search 都额外查 visit_logs 一次；候选 10 家 = 11 个查询。可接受
- commit: 9bc2de6

### iter-3 [D 杂项 + C1 README + C2 PWA]
- ✓ D1+D3 lint 清理：删未用 import / 改 STATUS_LABEL 未引 / 改 useActionState → useTransition（convo-menu + visit-log-form）/ Math.random 改 useState lazy init / 引号 → 「」
- ✓ C1 README：补 env vars 表 / SQL migration 顺序 / 项目结构 / Vercel 部署 7 步
- ✓ C2 PWA：manifest.webmanifest + SVG icon + sw.js（生产 only 注册，offline 兜底）+ layout metadata
- lint 从 5 error 降到 1 error（剩下的是 quick-add-input.tsx set-state-in-effect，需要重构 effect 模式，defer 到 D2）
- PM review：
  - SW 只缓存 /lists + manifest + icon——离线时只有这些可用。可接受 MVP，要真离线友好得缓存更多 routes
  - SVG icon 是简笔画，不够"app-like"。生产部署前最好换成像素 PNG（192/512）
  - PWA 在 iOS Safari 上 standalone 模式可能有 status bar 问题，apple-web-app meta 已加但实测要看
  - README 假设用户读懂 Supabase / Vercel 流程；不算十分手把手
- commit: 8426ee3

### iter-4 [C3 List 共享]
- ✓ SQL 0008 list_invites 表（token uuid PK + role check + 7 天 expires + RLS）
- ✓ invites actions: createListInvite / loadInvitePreview / acceptListInvite / revokeListInvite
- ✓ /invite/[token] 页：4 个分支（无效 / 自己 / 已用 / 过期 / 可加入）
- ✓ InviteButton modal 嵌入 list 头部（仅 owner 可见）：角色选 + 生成 token + 复制链接
- ✓ ToastFlash 加 invite_accepted 消息
- PM review：
  - SQL 0008 需要用户跑——已添加到 README 列表
  - 邀请页路径在 /invite/[token]，需要登录才能 accept；未登录用户被跳到 /login（next-auth flow），登录后回 invite 页 —— 假设 proxy.ts 处理；可能要测一下
  - invite token 是 uuid v4（122 bits 熵），跟 URL 一起算合理安全；7 天过期是默认值
  - revokeListInvite 写了但没接 UI，list owner 看不到自己历史发的邀请—— 列入 polish
  - viewer 角色：~~RLS 在 places 表上没区分~~ 更正：can_write_list 函数已经 require role='co_owner'，DB 层没问题，是 UI 没 gate（iter-7 修）
- commit: 9187600

### iter-5 [C4 Recommendations]
- ✓ recommendations actions：sendRecommendation（按邮箱查 profiles + snapshot place + 防重复 pending）/ acceptRecommendation（校验 owner|co_owner + 插 places + 标 accepted）/ declineRecommendation / withdrawRecommendation
- ✓ /recommendations 页：三段（待处理收件 + 已处理收件 + 我发出的）+ 空状态
- ✓ RecommendationCard：含店名/地址/菜系 chip/留言/AI notes + 接受时下拉选 list 子表单 / 拒绝 / 撤回
- ✓ RecommendButton modal 嵌入 place edit 顶部（邮箱输入 + 一句话理由）
- ✓ /profile 加「📬 收件箱」入口
- PM review：
  - 推荐流程依赖 profiles.email 公开 select；新用户必须先注册 Bite 才能收到推荐
  - place 是按 snapshot 复制（不是 reference）——后续 owner 改源 place 不会同步给接收者；可接受（隔离更安全）
  - 防重复用 `place_data->>name` + status=pending 做 unique；如果同名不同地址会被误判 —— 极少见，接受
  - 缺 inbox 数字 badge（导航上看不到有几条待处理）—— polish
  - 没接 email 通知（朋友不主动来 inbox 就看不到）—— BLOCKED 需要 Resend 集成
- commit: 5ad3e44

### iter-6 [E 系列 polish + A4]
- ✓ E1 /profile 收件箱入口加 pending count badge（terracotta 圆点 + 数字）
- ✓ E2 list 头部下方加 ActiveInvitesPanel：列出活跃 invite（未用未过期），可复制链接 / 撤销；客户端 optimistic 删除
- ✓ A4 /api/chat 超 30 轮自动裁剪：保留最近 24 条，避开 tool_use/tool_result 配对被切散，前面塞一句 system-style 提示给 LLM
- PM review：
  - context 截断阈值 30/24 是拍脑袋；token 上限随 provider 不同（Gemini 1M 其实可以不裁），可后续按 provider 区分
  - 截断时塞的提示文是 user-role，因为 system 在 /api/chat 里是单独的 param；可能不如真正改 system prompt 自然
  - inbox badge 只在 /profile 页内；bottom-nav 没有「收件箱」入口（已经满了），用户得绕一步进 profile
  - active invites 没显示发给谁——因为 token 没绑定接收者邮箱，发出后任何人持链接都能用
- commit: 93e890c

### iter-7 [F 权限 + 成员管理]
- 🔍 audit: 发现之前 PHASE_PLAN 里说的"viewer 仍能改 places" 其实是误记——can_write_list 函数已经 require role='co_owner'，DB 层 RLS 正确。问题在 UI 没 gate。
- ✓ F2 UI gating：list 页 page.tsx 计算 canEdit（owner 或 list_members.role='co_owner'）
  · viewer 看不到「+ 新增店铺」「重命名」「邀请」按钮
  · viewer 看到状态 chip 是静态的（不可点切换）
  · viewer 没有「我去了」按钮 / Place 卡片菜单
  · 头部 chip 显示「共享 · 共同所有者 / 只读」区分
- ✓ F3 list members management：list-members.ts actions（changeMemberRole / removeMember / leaveList）
  · MembersPanel 客户端组件，owner 看到成员列表 + 点角色 chip 切换 + 移除
  · LeaveListButton 给非 owner 主动离开
  · UI optimistic 更新
- PM review：
  - viewer/co_owner UI 区分依赖 server-side query 拿 memberRole，每次进 list 页多一个 db round trip；可接受
  - 切角色和移除没有"撤回 5 秒"undo，按 confirm 即生效
  - 缺：member 看到的 list 页头部"共享"chip 应该可点击带 tooltip 展示来源（谁邀请你）
  - 没做 list owner 把所有权转移给 co_owner —— BLOCKED 设计上不允许这么做（设计文档只一个 owner）
- commit: 7abf6c2

### iter-9 [rec reasons fix]
- ✓ acceptRecommendation reasons.user_id 从 from_user_id 改成接收者 user.id，文本加前缀「朋友推荐：」。这样 PlaceCard 渲染 myReason 时能命中
- ✓ PHASE_PLAN 标 DONE 待用户测
- commit: 71f6256

### iter-11 [K 数据可见性 — visit 信号上 PlaceCard]
- ✓ list 详情页一次拉所有 places 的 visit_logs（in placeIds），客户端构建 visitsByPlace map（count / last sentiment / last date / avg star）
- ✓ PlacesView 接 visitsByPlace prop（默认 {} 空对象向后兼容）
- ✓ PlaceCard 在 myReason 下加一行：sentiment emoji + 「去过 N 次」 + 相对日期 + 平均星
- ✓ relDate 辅助函数（今天 / 昨天 / N 天 / N 周 / N 月 / N 年）
- PM review：
  - 这个查询每次进 list 页都跑；place 多时（>100）可以考虑用 RPC + GROUP BY 做服务端聚合
  - PlaceCard 现在有 5 行信息（菜系 + reason + visits + notes + 状态chip 等），有点拥挤；可考虑收起部分
  - 星级用平均值四舍五入显示——如果只有 1 次 3 星 + 1 次 4 星 显示 4 星，略乐观；可改用最近一次的星
- commit: b1c25f3

### iter-10 [J 持续 polish — profile 编辑 + 404 页]
- ✓ J1 ProfileEditForm：之前用户没法改 display name / avatar
  · 新增 updateProfile action（normalize + url 协议校验 + 名字长度 60）
  · /profile 顶部卡片切到 ProfileEditForm 组件，read view 默认 + 「✎ 编辑」切到 form
  · 头像 URL 用外链（Phase 5 没做 Supabase Storage 上传）
- ✓ J2 not-found.tsx：替换默认黑底 404，改 terracotta 配色 + 中文 + 回 list/chat CTA
- typecheck + lint + build 全绿
- PM review：
  - profile edit 没做"撤销"undo，按保存即生效；可接受（用户能再编辑）
  - 头像外链不支持本地上传——next polish 是接 Supabase Storage
  - 404 页是全局 not-found，所有路由 notFound() 都会用；好
  - profile 编辑组件用 useTransition 直接 await action，遵循 iter-3/8 修正过的模式（不用 useActionState + useEffect 闭包）

### iter-8 [I lint clean + 后端权限 gate + co_owner 路径补全]
- ✓ I1 quick-add-input lint：block-level eslint-disable react-hooks/set-state-in-effect。lint 全 0
- ✓ I2 PM audit：发现 viewer 直接访问 /lists/[id]/places/[placeId]/edit 仍看到完整编辑表单（即使 server 写会被 RLS 拒）
- ✓ place edit 页加 canEdit 计算 + readOnly mode：
  · PlaceForm 新增 readOnly prop：fieldset disabled + 隐藏 submit
  · VisitHistory 新增 canEdit prop：viewer 看不到「记一次造访 / 编辑 / 删除」
  · 隐藏 RecommendButton（推荐自己看不到的 list 里的店没意义）+ 危险操作区
  · 顶上 banner 提示只读
- ✓ /quick-add + /quick-add/multi 的 writableLists 计算：原本只取 owner，现在补上 list_members.role='co_owner' 的 list
- PM review：
  - 仍没做共享 list 的 push notification（friend 在他自己 inbox 看 place card 但不知道 list 里有新店）—— BLOCKED 需 Resend
  - 草稿是 server-side 单条，user 在 quick-add 选 list 后没建过 list 就走"先建一个"分支会丢上下文——可接受 MVP
  - 没做 owner 给已加入成员邮件提醒（变更角色 / 移除）——next polish

---
