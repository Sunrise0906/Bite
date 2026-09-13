import Foundation

/// 店名的**去重键**。逐字移植自 bite/src/lib/places/name-key.ts —— 四条写入路径
/// （智能添加 / 手写 / AI 聊天 / 接受推荐）和「已存在」提示都必须用同一个键。
///
/// 背景（真实事故）：库里手写的是「MOri’s」（弯撇号 U+2019，iOS 键盘默认就打这个），
/// 小红书抽出来的是 ASCII 的「MOri's」，两边互不相等，静默新建了重复记录。
public enum NameKey {
    /// 只用于匹配，不用于展示。NFKC → 弯引号归一 → 折叠空白 → 小写。
    public static func normalize(_ name: String) -> String {
        var s = name.precomposedStringWithCompatibilityMapping // NFKC
        let apostrophes: [Character] = ["\u{2018}", "\u{2019}", "\u{201B}", "`", "\u{00B4}"]
        let quotes: [Character] = ["\u{201C}", "\u{201D}", "\u{201E}"]
        s = String(s.map { ch -> Character in
            if apostrophes.contains(ch) { return "'" }
            if quotes.contains(ch) { return "\"" }
            return ch
        })
        // 折叠内部连续空白（含全角空格，NFKC 已转成普通空格）+ 去首尾
        let parts = s.split(whereSeparator: { $0.isWhitespace || $0.isNewline })
        return parts.joined(separator: " ").lowercased()
    }

    /// 两个店名是否指同一条记录
    public static func same(_ a: String, _ b: String) -> Bool {
        normalize(a) == normalize(b)
    }

    /// 在一组已有店名里找同名的（「已存在 · 将覆盖更新」提示用）
    public static func findSame(_ name: String, in existing: [String]) -> String? {
        let key = normalize(name)
        guard !key.isEmpty else { return nil }
        return existing.first { normalize($0) == key }
    }
}
