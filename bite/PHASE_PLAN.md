# Bite Autonomous Dev Plan

> 用户离开 10h，我自主续干。每半小时一个 /loop iteration。

## 当前状态

- 启动 commit: `e96cd84` (phase-3-polish-r3)
- 已交付：phase 1（auth/lists）→ phase 2（quick-add + AI 抽取 + XHS）→ phase 3（多 provider + /chat + tool calling），3 轮 polish
- 用户已 run 0001-0007 SQL，配置了 GEMINI_API_KEY
- 待用户回来：测 Phase 3，run 后续 migration（如有）

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
- [ ] **A4. 对话超长上下文管理** — messages.length > 30 时把前面折叠 + 让 LLM 看截断 summary（可选优化，defer）

### B. Phase 4 — VisitLog + 我去了 + 地图

- [ ] **B1. SQL 0008** — 暂不需要（visit_logs 表已在 0001）
- [ ] **B2. visit server actions** — log / update / delete，写在 lib/actions/visits.ts
- [ ] **B3. 「我去了」按钮组件** — VisitLogButton.tsx：用在 PlaceCard 状态 chip 旁 + place edit 顶部
- [ ] **B4. VisitLog 表单 modal** — 日期 / sentiment / 星级 / note / 同行者
- [ ] **B5. 首次 log 自动 flip status** — want_to_go → visited（已在 B2 内）
- [ ] **B6. PlaceEdit 页 visit history 区** — 按日期倒序，可编辑/删除
- [ ] **B7. 扩 chat tools** — search_my_list 返回 visit_count + last_sentiment；check_place_details 含完整 visit 历史
- [ ] **B8. /map 页面** — Google Maps embed，显示用户所有 lat/lng places + 状态色码（暂用 react-google-maps 或原生 iframe）

### C. Phase 5 — 部署 + PWA + 协作 + 推荐

- [ ] **C1. README 部署文档** — Supabase 配置步骤 + Vercel 一键 deploy + env vars 清单
- [ ] **C2. PWA 基础** — manifest.json + apple-touch-icon + 最小 service worker（offline 兜底）
- [ ] **C3. List 共享 / co-owner** — invite link + accept 流程（list_members 表已在 0001）
- [ ] **C4. Recommendations inbox** — 朋友推荐的店 pending → accept/decline
- [ ] **C5. /map 共享 list overlay** — co-owner 的地图视图

### D. 杂项 / 修补

- [ ] **D1. 已知 lint warning 清理**：multi-place-list / place-confirm-form 未用 import、places.ts 未用变量
- [ ] **D2. quick-add-input 的 react-hooks/purity & set-state-in-effect 错误** — 重写 effect 模式
- [ ] **D3. lists/page.tsx 未转义引号** — 简单 fix
- [ ] **D4. 把 settings 表的 api_key 改成 vault 加密**（安全 polish；当前 RLS 兜底）— 标 BLOCKED 待用户决策

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
- 下一步：iter-2 进 Phase 4 (VisitLog 核心)

---
