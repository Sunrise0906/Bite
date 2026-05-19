# Bite — 餐厅记录 & 决策 App 设计文档

> 个人项目设计稿，作为开发起点。所有决策已经过产品讨论确认。
> "Bite" 为工作名称，可后期替换。

---

## 1. 项目概览

**用户**：PhD 学生（你），加州尔湾，常往返罗兰岗 LA。

**核心痛点**：
- 朋友推荐 / 小红书看到的店容易忘
- 和朋友、女朋友吃饭时纠结去哪
- 多个数据源（XHS / Yelp / Reddit / 朋友口头）信息分散
- 已经探索过的好店缺乏记录，无法回顾

**解决方案**：个人餐厅 list + AI 决策助手 + 多人协作 + 多渠道智能添加，全部集成在一个 web app 中。

---

## 2. 核心决策摘要

| 维度 | 决策 |
|---|---|
| 平台 | Web app, mobile-first 响应式, PWA 支持 |
| AI 集成 | API 直接调用（Anthropic Claude / OpenAI），AI 嵌入 App 内 |
| 数据必填字段 | 名字、地址、菜系（其他全部选填）|
| AI 助手范围 | 用户所有可访问的 list（自己 + 共享 + 朋友的）|
| AI 助手风格 | 主动、诚实、引用旧笔记、明确标注数据源、一次给 2-3 个选项 |
| 评分体系 | 🔥/👍/👎（主，必填）+ 5 星（副，选填）|
| 协作模型 | Co-owner（编辑）+ Viewer（只看）双角色 |
| 登录 | Google sign-in 一键登录 |

---

## 3. 数据模型

### 3.1 User

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | |
| email | string | 来自 Google sign-in |
| name | string | |
| avatar_url | string | Google 头像 |
| created_at | timestamp | |

### 3.2 List

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | |
| name | string | 用户自定义，比如 "Irvine 想吃的" |
| owner_id | UUID | 初始创建者 |
| collaborators | [{user_id, role}] | role: co-owner / viewer |
| created_at | timestamp | |

### 3.3 Place（店铺）

**必填字段：**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | |
| list_id | UUID | 所属 list |
| name | string | 店名 |
| address | string | 含 lat/lng，方便地图与距离计算 |
| cuisine | string[] | 菜系，支持多标签 |

**选填字段：**

| 字段 | 类型 | 说明 |
|---|---|---|
| price_range | enum | $ / $$ / $$$ / $$$$ |
| status | enum | want_to_go / visited / archived（默认 want_to_go）|
| reasons | [{user_id, text}] | 想去理由数组，共享 list 时多人各写自己的 |
| occasions | string[] | tag：约会、聚会、快餐、招待长辈… |
| recommended_by | string | "朋友 / XHS 博主 / 自己" |
| tags | string[] | 自定义标签 |
| source | enum | xhs / manual / ai_extract / google_places / yelp |
| source_url | string | 原 XHS 帖子链接等 |
| google_place_id | string | 关联 Google Places，便于实时查营业时间/排队 |
| created_at | timestamp | |

### 3.4 VisitLog

每次「我去了」创建一条。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | |
| place_id | UUID | |
| user_id | UUID | 谁去的 |
| visited_at | timestamp | |
| sentiment | enum | will_return / okay / wont_return（🔥/👍/👎）|
| star_rating | int | 1-5（选填）|
| note | string | 一句话评价 |
| photos | string[] | 照片 URL |
| companions | string | 自由文本，"和女朋友" / "@小李" |

### 3.5 Recommendation

跨 list 推荐时创建，pending 状态。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | |
| from_user_id | UUID | |
| to_user_id | UUID | |
| place_data | object | 完整 place 信息快照 |
| status | enum | pending / accepted / declined |
| created_at | timestamp | |

---

## 4. 核心用户流程

### 4.1 添加流程

**入口**：底部导航的「+」按钮 / 主页顶部置顶的输入框。

**统一输入框**：
> 「粘贴 XHS 链接、写几句话、或者搜店名…」

**AI 智能识别 4 种输入：**

| 输入类型 | 检测条件 | AI 行为 |
|---|---|---|
| 短文本（1-3 词）| 类似店名 | 调 Google Places autocomplete，下拉显示 3-5 家附近店铺，点击直接入库（地址/菜系/照片自动填好）|
| XHS 链接 | 匹配 xhs.com / xiaohongshu.com | 抓取帖子内容，AI 提取字段 |
| XHS 帖子文字 | 长文本 + XHS 特征（emoji、博主语气）| 同上 |
| 自由描述 | 长文本，非 XHS | AI 提取字段（名字、地址、菜系、价位、推荐理由）|

**必填字段缺失处理**：若 AI 无法提取必填字段，通过对话追问用户补齐。例如：
> AI："你描述的店听起来不错，但你没说店名。叫什么呀？记得吗？"

**入库后反馈**：显示解析字段供确认/修改，AI 主动问："要加点想去的理由吗？以后推荐更准。"

---

### 4.2 AI 决策聊天流程

**触发**：底部导航的「聊天」入口。

**AI 行为流程**：

1. 解析需求中的过滤条件（菜系、距离、价位、人数、场合）
2. 缺关键信息 → 反问补齐
3. 优先在用户有访问权限的 list 中搜索（自己 > 共享 > 朋友的，每条明确标来源）
4. list 内有结果 → 返回 2-3 家，附理由（引用旧笔记 / 标签 / 用户之前的评价）
5. list 内无合适 → 提示并询问是否扩展到 Yelp / XHS / Reddit
6. 给完选项后主动提议下一步动作（加 list / 看详情 / 导航 / 联系朋友）

**对话样例：**

> **用户**：今晚和俩朋友聚餐，3 个人，想吃中餐，预算别太贵
>
> *AI 后台调：search_my_list(cuisine="中餐", status="想去", price_max=$30)*
>
> **AI**：从你 list 里挑了 2 家"想去"的中餐：
>
> 1. **老北京炸酱面**（罗兰岗，$15/人，开车 ~40min）— 你加进来时写："解馋"
> 2. **海底捞**（罗兰岗，$50/人，~40min）— 你的 tag "聚会" 合适，但你也标了"排队长"
>
> ⚠️ 两家都在罗兰岗。你 list 里 Irvine 没有"想去"的中餐，要从 Yelp/XHS 找几家 Irvine 的新店吗？
>
> **用户**：今天就在 Irvine 懒得开远
>
> *AI 后台调：yelp_search(location="Irvine", cuisine="chinese", min_rating=4.0) + xhs_search("Irvine 中餐 聚餐")*
>
> **AI**：那从 Yelp + XHS 找了 3 家：
>
> 1. **小肥羊**（Irvine Spectrum）— 4.3 星，火锅，~$30/人。XHS 上"和朋友聚餐"被提了 5 次
> 2. **Capital Seafood**（Diamond Jamboree）— 4.1 星，粤式 + 海鲜，~$25/人
> 3. **Tasty Kitchen 美味轩**（University Center）— 4.2 星，川菜，~$20/人
>
> 要加进你"想去"吗？或者要看哪家具体评价？
>
> **用户**：第三个川菜听起来不错，加到 list。今晚就去
>
> *AI 后台调：add_to_list + check_hours + check_wait_time*
>
> **AI**：✓ Tasty Kitchen 已加进"想去"，标了"川菜"+"朋友聚餐"。今晚营业到 9:30 PM，Yelp 实时显示等位 ~15min。要导航过去吗？

---

### 4.3 吃完记录流程

**触发**：list 中任意 place 的「**我去了 ✓**」按钮（手动触发，**不做** 智能 reminder）。

**记录界面**：

- **怎么样？**（必填）：🔥 会再来 / 👍 还行 / 👎 不会再来
- **打个星**（选填）：1-5 星
- **想说点啥**（选填）：文本或语音输入
- **拍了照吗**（选填）：可上传多张
- **和谁去的**（选填）：自由文本（"和女朋友" / "@小李"）

**多次造访处理**：
- 每次创建新的 VisitLog 记录
- **重新造访同一店时**：表单**预填上次的数据**，用户只改有变化的部分
- 店详情页累积显示：去过次数 / 平均评分 / 最近一次 / 关键 tag 词云

---

### 4.4 协作流程

**两种协作模式（同一套权限模型实现）：**

#### Co-owner（合作者）模式 — 适合情侣、室友

- 多个用户共同维护一个 list
- 平等读写权限
- 每个用户的「我去了」记录标记是谁
- **共享 list 里的想去理由**：每个 co-owner 写自己的，共用一条 place 记录，理由列表显示：
  - `@你：朋友推荐`
  - `@女朋友：XHS 博主`

#### Viewer（观看者）模式 — 适合朋友圈

- 朋友能看你的 list 但不能改
- AI 决策时**默认**跨所有可访问 list 搜索，明确标来源："来自 @girlfriend 的 list"

#### 邀请方式

list 页面 → 「邀请」按钮 → 输入邮箱 / 生成分享链接 → 选择权限（共同编辑 / 只看）→ 对方 Google 登录后加入。

#### 推荐给朋友（核心跨 list 动作）

- 任意 place（你的 / AI 推荐的 / XHS 解析的）都可以点「推荐给 @朋友」
- 朋友的 list 顶部出现 pending 条目："@你 推荐了 XX 店"
- **朋友确认后才入库**（防止 list 被刷屏）

---

## 5. 玩乐（场景 B）扩展 — v2

未来扩展，**复用同一套 schema**：
- Place 表加一个 `category` 字段：`restaurant` / `boba` / `coffee` / `dessert` / `activity` / `hike` / `event`...
- AI 助手自然支持跨 category 推荐："今晚吃完饭去哪玩？"

v1 先专注吃喝，v2 再扩展玩乐。

---

## 6. MVP 范围 vs 后续

### v1（4 周开发量估算）

| 周 | 内容 |
|---|---|
| Week 1 | Next.js + Supabase + Google sign-in + Place CRUD + 地图视图 + PWA 配置 |
| Week 2 | 统一添加输入框 + AI 智能路由 + Google Places + XHS 解析 + AI 自由文本提取 |
| Week 3 | AI 决策聊天 + tool calling + Yelp/XHS 接入 + 数据源标注 |
| Week 4 | 我去了流程 + VisitLog + Co-owner 邀请 + 推荐给朋友（pending）|

### v2（后续）

- Viewer 模式 + AI 跨 list 查询
- 玩乐 category 扩展
- 智能触发（位置 / 聊天 reminder）
- Browser extension（桌面端快速添加）
- 原生 mobile app（web 验证成功后升级）
- Reddit 集成

---

## 7. 推荐技术栈

| 层 | 选择 | 理由 |
|---|---|---|
| Frontend | Next.js + React + Tailwind | 主流生态、AI 编程工具友好 |
| Backend / DB | Supabase | 内置 Auth + PostgreSQL + RLS + 实时同步，免费层够用 |
| AI | Anthropic Claude API | Tool calling 成熟，~$5/月 |
| 地图 | Google Maps + Places API | 餐厅数据最全 |
| 评分数据 | Yelp Fusion API | 美国本地权威，免费层够 |
| XHS 解析 | 自建轻量爬虫 / 第三方代理 | 注意 ToS 风险，仅个人项目轻量使用 |
| 部署 | Vercel | 一键部署，免费 |

---

## 附录：未决问题（建议开发中验证）

- **XHS 合集帖**（"罗兰岗 10 大宝藏餐厅"）→ AI 识别为列表后让用户勾选哪几家入库
- **XHS 地址模糊**（只写"南加""LA"）→ AI 反查 Google Places 精确化
- **数据所有权**：朋友离开共享 list 时，他的 VisitLog 是被一起带走、留下、还是变只读？v1 默认保留为只读历史
- **共享 list 的同店多人造访**：你和女朋友各自标"去了"，是合并显示还是独立 VisitLog？建议独立（用 companions 字段区分语境）
- **XHS 爬取的法律 / ToS 风险**：小心使用，重点在"为用户已经看到的内容做结构化"而非批量爬取
