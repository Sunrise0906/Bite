import Foundation

/// 四套主题（bite/src/app/v2.css 的 .theme-*）。这里只有 token（十六进制色 / 圆角 / 描边 /
/// 字体风格 / 阴影风格），App 里的 Design/Theme.swift 再把它变成 SwiftUI 的 Color / Font。
public enum BiteTheme: String, CaseIterable, Codable, Sendable {
    case terracotta, midnight, pop, gallery

    public var label: String {
        switch self {
        case .terracotta: return "陶土"
        case .midnight: return "深夜食堂"
        case .pop: return "鲜果软糖"
        case .gallery: return "净白画廊"
        }
    }

    public var subtitle: String {
        switch self {
        case .terracotta: return "暖陶土 · serif 标题 · 默认"
        case .midnight: return "常暗 · 金色 · 奢华衬线"
        case .pop: return "撞色 · 粗描边 · 硬阴影"
        case .gallery: return "极简 · 抹茶 · 大留白"
        }
    }

    /// 选择器里的三个色卡
    public var dots: [String] {
        switch self {
        case .terracotta: return ["#c75b3a", "#faf6f0", "#5f7155"]
        case .midnight: return ["#d4a04f", "#131110", "#f4ede2"]
        case .pop: return ["#f04e23", "#fffdf5", "#3f9142"]
        case .gallery: return ["#4d7c5f", "#f6f6f4", "#1c1c1e"]
        }
    }

    /// 深夜食堂永远是暗的
    public var forcesDark: Bool { self == .midnight }
}

public enum ThemeFontStyle: Sendable { case serif, serifLuxe, grotesk, sans }
public enum ThemeShadowStyle: Sendable { case soft, glow, hard, flat }

public struct ThemeRadii: Hashable, Sendable {
    public var xs: Double, sm: Double, md: Double, lg: Double, xl: Double
    public init(xs: Double, sm: Double, md: Double, lg: Double, xl: Double) {
        self.xs = xs; self.sm = sm; self.md = md; self.lg = lg; self.xl = xl
    }
}

public struct ThemeTokens: Sendable {
    public var bg, surface, surface2, sunken: String
    public var ink, ink2, muted, faint: String
    public var primary, primaryDeep, onPrimary, primarySoft, primarySoftTx: String
    public var sage, sageSoft, sageTx: String
    public var gold, goldSoft, goldTx: String
    public var danger, dangerBg, dangerTx: String
    public var link: String
    public var border, border2: String
    public var borderWidth: Double
    public var radii: ThemeRadii
    public var fontStyle: ThemeFontStyle
    public var shadowStyle: ThemeShadowStyle
    public var isDark: Bool

    /// 全部颜色 token（测试用：保证每个都是合法 hex）
    public var allColors: [String] {
        [bg, surface, surface2, sunken, ink, ink2, muted, faint, primary, primaryDeep, onPrimary, primarySoft, primarySoftTx,
         sage, sageSoft, sageTx, gold, goldSoft, goldTx, danger, dangerBg, dangerTx, link, border, border2]
    }

    public static func tokens(for theme: BiteTheme, dark: Bool) -> ThemeTokens {
        switch theme {
        case .terracotta: return dark ? terracottaDark : terracottaLight
        case .midnight: return midnight
        case .pop: return dark ? popDark : popLight
        case .gallery: return dark ? galleryDark : galleryLight
        }
    }

    // ---- 陶土（基底） ----
    static let terracottaLight = ThemeTokens(
        bg: "#faf6f0", surface: "#ffffff", surface2: "#f3ebe0", sunken: "#ece2d4",
        ink: "#211b14", ink2: "#4a4034", muted: "#8a7e6c", faint: "#b3a691",
        primary: "#c75b3a", primaryDeep: "#9c4226", onPrimary: "#ffffff", primarySoft: "#fbe7dd", primarySoftTx: "#8c3a1c",
        sage: "#5f7155", sageSoft: "#e8ede3", sageTx: "#3f4f37",
        gold: "#b8862f", goldSoft: "#f6ebd3", goldTx: "#785621",
        danger: "#b3261e", dangerBg: "#fbe7e4", dangerTx: "#7f1d16",
        link: "#c75b3a", border: "#ece2d4", border2: "#ddccb6",
        borderWidth: 1, radii: ThemeRadii(xs: 9, sm: 12, md: 14, lg: 16, xl: 22),
        fontStyle: .serif, shadowStyle: .soft, isDark: false)

    static let terracottaDark = ThemeTokens(
        bg: "#191510", surface: "#241e17", surface2: "#2a2218", sunken: "#15110c",
        ink: "#f5efe6", ink2: "#ddd2bf", muted: "#a89c84", faint: "#7d7363",
        primary: "#e0886a", primaryDeep: "#eb9d82", onPrimary: "#221409", primarySoft: "#3d2a20", primarySoftTx: "#f4cdb9",
        sage: "#8fa683", sageSoft: "#25301f", sageTx: "#c4d4b9",
        gold: "#d4a847", goldSoft: "#352a13", goldTx: "#ecd29a",
        danger: "#e5484d", dangerBg: "#3a1d1c", dangerTx: "#f4b9b5",
        link: "#e0886a", border: "#33291f", border2: "#463829",
        borderWidth: 1, radii: ThemeRadii(xs: 9, sm: 12, md: 14, lg: 16, xl: 22),
        fontStyle: .serif, shadowStyle: .soft, isDark: true)

    // ---- 深夜食堂 ----
    static let midnight = ThemeTokens(
        bg: "#131110", surface: "#1d1916", surface2: "#262019", sunken: "#0c0a09",
        ink: "#f4ede2", ink2: "#d9cdbb", muted: "#9c8f7c", faint: "#6f6455",
        primary: "#d4a04f", primaryDeep: "#e6bd7a", onPrimary: "#201505", primarySoft: "#332714", primarySoftTx: "#ecd7a8",
        sage: "#7d9471", sageSoft: "#222b1e", sageTx: "#b9cdaa",
        gold: "#d4a847", goldSoft: "#352a13", goldTx: "#ecd29a",
        danger: "#e5484d", dangerBg: "#3a1d1c", dangerTx: "#f4b9b5",
        link: "#d4a04f", border: "#2e2620", border2: "#4a3d2d",
        borderWidth: 1, radii: ThemeRadii(xs: 7, sm: 10, md: 12, lg: 14, xl: 18),
        fontStyle: .serifLuxe, shadowStyle: .glow, isDark: true)

    // ---- 鲜果软糖 ----
    static let popLight = ThemeTokens(
        bg: "#fffdf5", surface: "#ffffff", surface2: "#fff3c9", sunken: "#f5ecd2",
        ink: "#211d1a", ink2: "#443c34", muted: "#7d7468", faint: "#a89d90",
        primary: "#f04e23", primaryDeep: "#c73312", onPrimary: "#211d1a", primarySoft: "#ffe0d6", primarySoftTx: "#a02c10",
        sage: "#3f9142", sageSoft: "#dcf5d7", sageTx: "#22662a",
        gold: "#d9a406", goldSoft: "#fdf0bd", goldTx: "#805e08",
        danger: "#d21f1f", dangerBg: "#ffdada", dangerTx: "#7f1414",
        link: "#c73312", border: "#211d1a", border2: "#211d1a",
        borderWidth: 2, radii: ThemeRadii(xs: 6, sm: 8, md: 10, lg: 12, xl: 16),
        fontStyle: .grotesk, shadowStyle: .hard, isDark: false)

    static let popDark = ThemeTokens(
        bg: "#1b1613", surface: "#261f19", surface2: "#39301c", sunken: "#131009",
        ink: "#f7efe4", ink2: "#ded2c0", muted: "#a3968a", faint: "#776c60",
        primary: "#ff6a45", primaryDeep: "#ff8866", onPrimary: "#2a0d02", primarySoft: "#432014", primarySoftTx: "#ffc9b5",
        sage: "#5fb763", sageSoft: "#1e3320", sageTx: "#b3e0b5",
        gold: "#eabb2b", goldSoft: "#3a2f0d", goldTx: "#f2dc93",
        danger: "#ff5c5c", dangerBg: "#3f1919", dangerTx: "#ffbcbc",
        link: "#ff8866", border: "#f7efe4", border2: "#f7efe4",
        borderWidth: 2, radii: ThemeRadii(xs: 6, sm: 8, md: 10, lg: 12, xl: 16),
        fontStyle: .grotesk, shadowStyle: .hard, isDark: true)

    // ---- 净白画廊 ----
    static let galleryLight = ThemeTokens(
        bg: "#f6f6f4", surface: "#ffffff", surface2: "#efefec", sunken: "#e9e9e5",
        ink: "#1c1c1e", ink2: "#48484a", muted: "#79797d", faint: "#a8a8ac",
        primary: "#4d7c5f", primaryDeep: "#3b6349", onPrimary: "#ffffff", primarySoft: "#e4eee7", primarySoftTx: "#31543d",
        sage: "#6b7d6f", sageSoft: "#e8ece9", sageTx: "#465248",
        gold: "#b08d3e", goldSoft: "#f1e9d4", goldTx: "#71592a",
        danger: "#c0392b", dangerBg: "#f7e3e0", dangerTx: "#7f291f",
        link: "#4d7c5f", border: "#e7e7e3", border2: "#d6d6d1",
        borderWidth: 1, radii: ThemeRadii(xs: 8, sm: 12, md: 14, lg: 18, xl: 24),
        fontStyle: .sans, shadowStyle: .flat, isDark: false)

    static let galleryDark = ThemeTokens(
        bg: "#131315", surface: "#1d1d20", surface2: "#26262a", sunken: "#0e0e10",
        ink: "#f2f2f2", ink2: "#d2d2d4", muted: "#98989d", faint: "#6a6a6f",
        primary: "#7cae8e", primaryDeep: "#98c4a6", onPrimary: "#122018", primarySoft: "#25342b", primarySoftTx: "#c3dccb",
        sage: "#8b9c8f", sageSoft: "#242a26", sageTx: "#c2cec5",
        gold: "#c8a45c", goldSoft: "#312a18", goldTx: "#e6d3a4",
        danger: "#e0695c", dangerBg: "#38201d", dangerTx: "#f2c1ba",
        link: "#7cae8e", border: "#2a2a2e", border2: "#3a3a3f",
        borderWidth: 1, radii: ThemeRadii(xs: 8, sm: 12, md: 14, lg: 18, xl: 24),
        fontStyle: .sans, shadowStyle: .flat, isDark: true)
}

/// "#rrggbb" → (r, g, b) 0...1；非法返回 nil
public enum HexColor {
    public static func rgb(_ hex: String) -> (r: Double, g: Double, b: Double)? {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return (Double((v >> 16) & 0xff) / 255, Double((v >> 8) & 0xff) / 255, Double(v & 0xff) / 255)
    }
}
