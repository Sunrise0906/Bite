import SwiftUI
import BiteCore

/// 把 BiteCore 的主题 token 变成 SwiftUI 的 Color / Font。通过 @Environment(\.bite) 取用。
struct BiteThemeValues {
    let theme: BiteTheme
    let tokens: ThemeTokens

    let bg, surface, surface2, sunken: Color
    let ink, ink2, muted, faint: Color
    let primary, primaryDeep, onPrimary, primarySoft, primarySoftTx: Color
    let sage, sageSoft, sageTx: Color
    let gold, goldSoft, goldTx: Color
    let danger, dangerBg, dangerTx: Color
    let link, border, border2: Color

    init(theme: BiteTheme, colorScheme: ColorScheme) {
        self.theme = theme
        let tk = ThemeTokens.tokens(for: theme, dark: colorScheme == .dark)
        tokens = tk
        bg = Color(hex: tk.bg); surface = Color(hex: tk.surface); surface2 = Color(hex: tk.surface2); sunken = Color(hex: tk.sunken)
        ink = Color(hex: tk.ink); ink2 = Color(hex: tk.ink2); muted = Color(hex: tk.muted); faint = Color(hex: tk.faint)
        primary = Color(hex: tk.primary); primaryDeep = Color(hex: tk.primaryDeep); onPrimary = Color(hex: tk.onPrimary)
        primarySoft = Color(hex: tk.primarySoft); primarySoftTx = Color(hex: tk.primarySoftTx)
        sage = Color(hex: tk.sage); sageSoft = Color(hex: tk.sageSoft); sageTx = Color(hex: tk.sageTx)
        gold = Color(hex: tk.gold); goldSoft = Color(hex: tk.goldSoft); goldTx = Color(hex: tk.goldTx)
        danger = Color(hex: tk.danger); dangerBg = Color(hex: tk.dangerBg); dangerTx = Color(hex: tk.dangerTx)
        link = Color(hex: tk.link); border = Color(hex: tk.border); border2 = Color(hex: tk.border2)
    }

    var radii: ThemeRadii { tokens.radii }
    var bw: CGFloat { CGFloat(tokens.borderWidth) }
    var isDark: Bool { tokens.isDark }

    /// 展示标题（serif / 奢华衬线 / 圆体粗字 / 无衬线，按主题）
    func display(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        switch tokens.fontStyle {
        case .serif: return .system(size: size, weight: weight, design: .serif)
        case .serifLuxe: return .system(size: size, weight: weight == .semibold ? .bold : weight, design: .serif)
        case .grotesk: return .system(size: size, weight: .heavy, design: .rounded)
        case .sans: return .system(size: size, weight: .bold, design: .default)
        }
    }

    func text(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        switch tokens.fontStyle {
        case .grotesk: return .system(size: size, weight: weight, design: .rounded)
        default: return .system(size: size, weight: weight)
        }
    }

    /// 品牌字标（登录页大 Bite）
    var brand: Font { .system(size: 44, weight: .semibold, design: .serif) }
}

extension Color {
    init(hex: String) {
        let rgb = HexColor.rgb(hex) ?? (0, 0, 0)
        self.init(red: rgb.r, green: rgb.g, blue: rgb.b)
    }
}

private struct BiteThemeKey: EnvironmentKey {
    static let defaultValue = BiteThemeValues(theme: .terracotta, colorScheme: .light)
}

extension EnvironmentValues {
    var bite: BiteThemeValues {
        get { self[BiteThemeKey.self] }
        set { self[BiteThemeKey.self] = newValue }
    }
}

/// 根据当前主题 + 系统明暗解析出 token，注入环境
struct ThemedRoot<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    let theme: BiteTheme
    @ViewBuilder let content: () -> Content

    init(theme: BiteTheme, @ViewBuilder content: @escaping () -> Content) {
        self.theme = theme
        self.content = content
    }

    var body: some View {
        let values = BiteThemeValues(theme: theme, colorScheme: theme.forcesDark ? .dark : colorScheme)
        content()
            .environment(\.bite, values)
            .tint(values.primary)
            .background(values.bg.ignoresSafeArea())
    }
}

// MARK: - 修饰器

enum BiteShadowLevel { case small, card, button }

struct BiteShadowModifier: ViewModifier {
    @Environment(\.bite) private var t
    var level: BiteShadowLevel

    func body(content: Content) -> some View {
        switch t.tokens.shadowStyle {
        case .hard:
            // 新粗野派：硬阴影，不模糊
            let off: CGFloat = level == .card ? 5 : 3
            content.shadow(color: t.ink.opacity(0.9), radius: 0, x: off, y: off)
        case .glow:
            switch level {
            case .button: content.shadow(color: t.primary.opacity(0.28), radius: 9)
            case .card: content.shadow(color: .black.opacity(0.45), radius: 10, y: 4)
            case .small: content.shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
        case .flat:
            content.shadow(color: .black.opacity(level == .small ? 0.04 : 0.05), radius: level == .small ? 1 : 6, y: level == .small ? 1 : 3)
        case .soft:
            switch level {
            case .button: content.shadow(color: t.primaryDeep.opacity(0.22), radius: 6, y: 4)
            case .card: content.shadow(color: Color(red: 0.24, green: 0.16, blue: 0.09).opacity(t.isDark ? 0.35 : 0.08), radius: 12, y: 6)
            case .small: content.shadow(color: Color(red: 0.24, green: 0.16, blue: 0.09).opacity(t.isDark ? 0.3 : 0.05), radius: 2, y: 1)
            }
        }
    }
}

struct BiteCardModifier: ViewModifier {
    @Environment(\.bite) private var t
    var padding: CGFloat
    var radius: CGFloat?
    var shadow: BiteShadowLevel
    var background: Color?

    func body(content: Content) -> some View {
        let r = radius ?? t.radii.lg
        content
            .padding(padding)
            .background(background ?? t.surface)
            .clipShape(RoundedRectangle(cornerRadius: r, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).stroke(t.border, lineWidth: t.bw))
            .modifier(BiteShadowModifier(level: shadow))
    }
}

extension View {
    func biteCard(padding: CGFloat = 12, radius: CGFloat? = nil, shadow: BiteShadowLevel = .small, background: Color? = nil) -> some View {
        modifier(BiteCardModifier(padding: padding, radius: radius, shadow: shadow, background: background))
    }

    func biteShadow(_ level: BiteShadowLevel = .small) -> some View {
        modifier(BiteShadowModifier(level: level))
    }

    /// 输入框皮：圆角 + 描边 + surface 底
    func biteField() -> some View {
        modifier(BiteFieldModifier())
    }

    /// 页面统一的横向留白（web 的 .v2-page：max 480 居中，左右 16）
    func bitePage() -> some View {
        modifier(BitePageModifier())
    }
}

struct BiteFieldModifier: ViewModifier {
    @Environment(\.bite) private var t
    func body(content: Content) -> some View {
        content
            .font(t.text(16))
            .foregroundStyle(t.ink)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(t.surface)
            .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous).stroke(t.border2, lineWidth: t.bw))
    }
}

struct BitePageModifier: ViewModifier {
    @Environment(\.bite) private var t
    func body(content: Content) -> some View {
        content
            .frame(maxWidth: 560)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
    }
}
