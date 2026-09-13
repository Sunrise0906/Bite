// swift-tools-version: 5.9
// BiteCore：iOS App 的纯 Swift 内核 —— 数据模型 + 从 web 端逐一移植的纯逻辑
// （店名去重键、评价档位极性、距离、造访聚合、相对时间、输入类型识别、聊天 SSE 解析、主题 token）。
//
// 不依赖 SwiftUI / Supabase SDK，所以在只装了 Command Line Tools 的 Mac 上也能
// `swift build && swift test`。Bite App target 和 BiteShare 扩展都依赖它。
// tools-version 5.9 ⇒ Swift 5 语言模式（严格并发只报 warning，不阻塞编译）。
import PackageDescription

let package = Package(
    name: "BiteCore",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "BiteCore", targets: ["BiteCore"]),
    ],
    targets: [
        .target(name: "BiteCore"),
        .testTarget(name: "BiteCoreTests", dependencies: ["BiteCore"]),
    ]
)
