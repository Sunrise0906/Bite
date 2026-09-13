# Bite iOS

网页版（`../bite`，Next.js + Supabase）的原生 iOS 客户端。**同一个 Supabase 项目、同一套数据**，网页和 App 互通。

- **SwiftUI · iOS 17+ · Swift 5 语言模式**（Xcode 16.4+；用 `supabase-swift` 需要 Swift 6.1 工具链）
- 读 / 普通写 **直连 Supabase**（RLS 管权限，和网页同一条约定）
- 需要**服务端密钥或副作用**的操作走网页那台服务器的 `/api/mobile/*` 与 `/api/chat`（Bearer token）：
  AI 抽取 / 小红书抓取 / Google Places / 推送 / 邮件 / 加密的 LLM 设置
- 网页做不到的两件事：**「分享到 Bite」**（小红书 App 直接分享进来）和 **原生推送（APNs）**

## 目录

```text
ios/
├── project.yml              # XcodeGen 工程描述（Bite.xcodeproj 是生成物，不入库）
├── Config/                  # xcconfig：Base / Debug / Release + Local.xcconfig（密钥，不入库）
├── Packages/BiteCore/       # 纯 Swift 包：模型 + 从 web 逐一移植的纯逻辑 + 单测（swift test 可跑）
├── Shared/ShareInbox.swift  # 分享扩展 ↔ 主 App 的 App Group 交接盒（两个 target 共用）
├── Bite/                    # App target
│   ├── App/                 # 入口 / AppSession（登录态、主题、toast）/ Router + 深链 / TabView
│   ├── Services/            # Env · BiteAPI（/api/mobile + SSE）· Repositories（直连 Supabase）· Photo / Location / Push
│   ├── Design/              # 四套主题 token → SwiftUI（Theme.swift）+ 组件（按钮 / 药丸 / 卡片 / toast…）
│   ├── Features/            # Auth · Home · Lists · Places · QuickAdd · Chat · Nearby · Pick · Stats · Profile · Recommendations · Invite
│   └── Resources/           # Assets（图标 / 强调色 / 启动色）· PrivacyInfo
└── BiteShare/               # 分享扩展（SLComposeServiceViewController）
```

## 第一次跑起来

### 0. 前置

| 需要 | 说明 |
| --- | --- |
| **Xcode 16.4+**（App Store 装） | 这台 Mac 目前只有 Command Line Tools，`xcodebuild` 跑不了。装完记得 `sudo xcode-select -s /Applications/Xcode.app` |
| **XcodeGen** | `brew install xcodegen` |
| Apple ID | 免费个人账号就能跑模拟器 / 真机（推送、Universal Links 要付费账号，见下） |

### 1. 填配置

```bash
cd ios
cp Config/Local.xcconfig.example Config/Local.xcconfig
```

填 `Local.xcconfig`（⚠️ xcconfig 里 `//` 是注释，URL 要写成 `https:/$()/host`，示例文件里已经是这个写法）：

| 变量 | 值 |
| --- | --- |
| `SUPABASE_URL` | `bite/.env.local` 里 `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | `bite/.env.local` 里 `NEXT_PUBLIC_SUPABASE_ANON_KEY`（公开 key，可以进 App） |
| `BITE_API_BASE_URL` | 网页部署域名（`https:/$()/bite-sand.vercel.app`）。本地联调：模拟器可填 `http:/$()/localhost:3000`，真机填 Mac 的局域网 IP |
| `BITE_TEAM_ID` | Apple 开发者 Team ID（可留空，在 Xcode Signing 里选） |
| `BITE_BUNDLE_ID` | 默认 `com.sunrise.bite`；改了要和服务端 `APNS_BUNDLE_ID` / `IOS_BUNDLE_ID` 一致 |

### 2. Supabase 后台加一条回调地址

Supabase Dashboard → Authentication → URL Configuration → **Redirect URLs** 加：

```text
bite://auth/callback
```

Magic Link / 注册验证邮件 / Google 登录 都回跳到这个 scheme。不加的话点邮件里的链接会落到网页而不是 App。
（Google OAuth 本身复用网页已经配好的 provider，不用改。）

### 3. 跑一条 migration（推送用，可选）

`bite/sql/0029_device_tokens.sql` —— 在 Supabase SQL Editor 里粘贴执行。不跑的话 App 其他功能照常，只是开通知时会提示「推送还没启用」。

### 4. 生成工程、打开

```bash
cd ios
xcodegen generate
open Bite.xcodeproj
```

Xcode 第一次会解析 Swift Package（`supabase-swift`）。选一个模拟器 ⌘R。真机需要在 Signing & Capabilities 里选 Team。

**免费个人账号**：只保留了 App Groups 能力（分享扩展要用）。如果 Xcode 报「Personal development teams do not support…」，把对应能力删掉即可；推送和 Universal Links 需要付费账号（见下两节）。

### 5. 服务端（`bite/`）要配的

网页那台服务器已经带上了 App 需要的接口（`src/app/api/mobile/*`）；**不用额外部署**，push 到 main 让 Vercel 重新部署即可。可选的 env（Vercel → Environment Variables）：

| 变量 | 用途 |
| --- | --- |
| `APNS_TEAM_ID` `APNS_KEY_ID` `APNS_PRIVATE_KEY` `APNS_BUNDLE_ID` | iOS 推送（缺任一则 iOS 推送静默关闭，网页 Web Push 不受影响） |
| `APPLE_TEAM_ID` `IOS_BUNDLE_ID` | 生成 `/.well-known/apple-app-site-association`（Universal Links）；不配则 404 |

## 与网页版的对应关系

| 网页 | App | 数据走哪 |
| --- | --- | --- |
| 登录 / 注册（密码 · Magic Link · Google） | `Features/Auth` | supabase-swift（OAuth 用 `ASWebAuthenticationSession`） |
| 主页决策中枢 / 想去 deck / 清单管理 | `Features/Home` | 直连 |
| 清单详情：筛选 / 状态一键切换 / 快捷评价 / 成员 / 邀请链接 | `Features/Lists` | 直连；**接受邀请**走 API（要通知发起人） |
| 店铺详情：营业状态 / Google 口碑 / 理由 / AI 点评 / 招牌菜 / 菜单 / 导航 / 留言 | `Features/Places` | 直连；营业状态、**发留言** 走 API |
| 我去了（造访 + 档位 + 照片）/ 编辑 / 手动新增 | `Features/Places` | 直连（照片直传 Storage）；**手动新增**走 API（查重 + 通知） |
| 智能添加：小红书链接 / 文字 / 拍照 / 店名搜索 / 合集帖多店 | `Features/QuickAdd` | 全部走 API（LLM、抓取、Google key 都在服务端） |
| AI 聊天（工具调用、«店名» 链接、推荐卡、重新生成、清单作用域） | `Features/Chat` | `/api/chat` SSE（Bearer） |
| 附近去哪（定位 + 距离排序 + 地图） | `Features/Nearby` | 直连；地图用 **MapKit**（不再需要浏览器端 Google key） |
| 一起选（双人滑卡） | `Features/Pick` | API（匹配判定 + 推送在服务端） |
| 吃喝足迹 | `Features/Stats` | 直连 |
| 我的：资料 / 4 套主题 / 通知 / AI 用量 / AI 模型设置 | `Features/Profile` | 直连；**AI 设置**走 API（key 服务端加密） |
| 推荐收件箱 | `Features/Recommendations` | 直连；**发送 / 接受**走 API（邮件 + 推送 / 合并逻辑） |
| 主题 cookie | `UserDefaults`（每台设备各自记） | — |
| Web Push（VAPID） | **APNs**（`sql/0029` + `lib/push/apns.ts`） | 同一个 `sendPushToUsers` 触发点 |
| PWA「添加到主屏幕」 | 原生 + **分享扩展** | — |

去重键、档位极性（1 最好 vs 星级 5 最好）、造访聚合、相对时间、SSE 解析等纯逻辑在 `Packages/BiteCore`，
每一处都标了移植自 web 的哪个文件；行为改动请两边同步。

## 验证

```bash
# 纯逻辑单测（不需要 Xcode，Command Line Tools 就够）
cd ios/Packages/BiteCore && swift test

# 全部 Swift 源码的语法检查（不解析模块）
cd ios && for f in $(find Bite BiteShare Shared -name '*.swift'); do xcrun swiftc -parse "$f" || echo "FAIL $f"; done
```

真正的编译 / 运行要等 Xcode 装好：`xcodegen generate && xcodebuild -scheme Bite -destination 'platform=iOS Simulator,name=iPhone 16' build`。

## 推送（APNs）

1. Apple Developer → Certificates, Identifiers & Profiles → **Keys** → 新建一把勾选 *Apple Push Notifications service (APNs)* 的 Key，下载 `.p8`，记下 Key ID 和 Team ID
2. Vercel 加 `APNS_TEAM_ID` / `APNS_KEY_ID` / `APNS_PRIVATE_KEY`（把 .p8 整段贴进去，多行或 `\n` 转义都行）/ `APNS_BUNDLE_ID`
3. 跑 `bite/sql/0029_device_tokens.sql`
4. Xcode → Bite target → Signing & Capabilities → **+ Push Notifications**（会往 `Bite/Bite.entitlements` 加 `aps-environment`）
5. App 里「我的 → 通知 → 开启」

Debug 构建连 APNs sandbox，TestFlight / App Store 连 production —— App 会把环境一起登记，服务端按行发。
触发点和网页完全一样：推荐 / 邀请加入 / 共享清单新店 / 一起选匹配 / 留言。

## Universal Links（邀请链接直接在 App 里打开）

1. Vercel 加 `APPLE_TEAM_ID`（和 `IOS_BUNDLE_ID`，默认 `com.sunrise.bite`）→ 重新部署 → 访问
   `https://<域名>/.well-known/apple-app-site-association` 应返回 JSON
2. Xcode → Signing & Capabilities → **+ Associated Domains** → `applinks:<域名>`
3. 之后 `https://<域名>/invite/<token>`、`/lists/<id>`、`/recommendations` 都会直接在 App 里打开；没装 App 的人照常落到网页

不配也没关系：App 内复制的邀请链接仍然是网页链接，对方在浏览器里接受。`bite://invite/<token>` 这种自定义 scheme 一直可用。

## 分享扩展

在小红书 / Safari / 相册里 分享 → **Bite** → 内容写进 App Group 交接盒，主 App 回到前台就弹智能添加
（链接会自动开抓；图片走拍照识店）。扩展和主 App 通过 `BITE_APP_GROUP`（`group.<bundle id>`）共享，
Local.xcconfig 里改了 bundle id 会自动跟着变。

## 已知限制 / 后续

- 主题字体用系统字体（serif = New York，圆体 = SF Rounded）；网页用的 Fraunces / Playfair / Space Grotesk 是 Google Fonts，
  要一致的话把字体文件放进 `Bite/Resources/Fonts` 并在 `Design/Theme.swift` 的 `display()` 里换成 `Font.custom`
- 小红书 CDN 的老图外链可能 403（网页同样），新加的店已由服务端转存到自有 Storage
- 聊天里「停止」只停本地流；服务端会把已生成的部分落库（和网页一致）
- 语音输入用系统 `SFSpeechRecognizer`（zh-CN），首次会请求麦克风 + 语音识别权限
