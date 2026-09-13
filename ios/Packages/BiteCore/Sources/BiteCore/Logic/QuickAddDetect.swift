import Foundation

/// 智能添加输入框：短文本 → 店名搜索；长文本 / 小红书链接 → AI 抽取。
/// 移植自 bite/src/lib/quick-add/detect.ts + lib/places/xhs.ts 的链接正则。
public enum QuickAddDetect {
    public enum InputType: Equatable, Sendable {
        case empty
        /// ≤12 字符且无换行 → Google Places 补全
        case placeName
        /// 长文本 / 含小红书链接 → AI 提取
        case freeText(hasXhsUrl: Bool)
    }

    /// 小红书分享链接域名不止一个，同一个短链服务还有 .com / .cn 两套。
    /// 漏掉任何一个，那条链接就不会被当成小红书链接 —— 店名会抽成「（未知）」。
    static let xhsPattern = #"https?://(?:www\.)?(?:xiaohongshu\.com|xhslink\.(?:com|cn)|xhs\.(?:cn|com))/[^\s<>"']+"#

    public static func extractXhsUrl(_ input: String) -> String? {
        guard let r = input.range(of: xhsPattern, options: [.regularExpression, .caseInsensitive]) else { return nil }
        return String(input[r])
    }

    public static func stripXhsUrl(_ input: String) -> String {
        input.replacingOccurrences(of: xhsPattern, with: "", options: [.regularExpression, .caseInsensitive])
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public static let shortLength = 12

    public static func detect(_ input: String) -> InputType {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return .empty }
        if extractXhsUrl(trimmed) != nil { return .freeText(hasXhsUrl: true) }
        if trimmed.count <= shortLength, !trimmed.contains("\n") { return .placeName }
        return .freeText(hasXhsUrl: false)
    }
}
