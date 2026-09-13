import Foundation

/// 构建期注入的配置（Config/Local.xcconfig → Info.plist → 这里）。
/// ⚠️ xcconfig 里 `//` 会被当注释，URL 要写成 `https:/$()/xxx.supabase.co`，见 Config/Local.xcconfig.example。
enum Env {
    static let urlScheme = "bite"

    static var supabaseURLString: String { plist("SUPABASE_URL") }
    static var supabaseAnonKey: String { plist("SUPABASE_ANON_KEY") }
    static var apiBaseURLString: String { plist("BITE_API_BASE_URL") }
    static var appGroup: String { plist("BITE_APP_GROUP") }

    static var supabaseURL: URL { URL(string: supabaseURLString) ?? URL(string: "https://invalid.supabase.co")! }
    static var apiBaseURL: URL { URL(string: apiBaseURLString) ?? URL(string: "https://invalid.example")! }
    /// 网页域名（universal link / 邀请链接复制时用）
    static var webHost: String { apiBaseURL.host ?? "" }

    /// 三个必填项都在才算配置完成；否则首屏显示配置指引而不是崩溃
    static var isConfigured: Bool {
        supabaseURLString.hasPrefix("http") && !supabaseAnonKey.isEmpty && apiBaseURLString.hasPrefix("http")
    }

    private static func plist(_ key: String) -> String {
        ((Bundle.main.object(forInfoDictionaryKey: key) as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
