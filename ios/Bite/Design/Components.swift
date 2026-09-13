import SwiftUI
import BiteCore

// MARK: - 按钮

enum BiteButtonKind { case primary, ghost, sage, danger, hubSecondary }

struct BiteButtonStyle: ButtonStyle {
    @Environment(\.bite) private var t
    @Environment(\.isEnabled) private var isEnabled
    var kind: BiteButtonKind = .primary
    var full: Bool = false
    var compact: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        let r = t.radii.md
        configuration.label
            .font(t.text(compact ? 12.5 : 14, weight: .semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, compact ? 12 : 16)
            .padding(.vertical, compact ? 7 : 12)
            .frame(maxWidth: full ? .infinity : nil)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: r, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).stroke(strokeColor, lineWidth: strokeWidth))
            .modifier(BiteShadowModifier(level: kind == .primary ? .button : .small))
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }

    private var foreground: Color {
        switch kind {
        case .primary, .sage: return t.onPrimary
        case .ghost: return t.ink
        case .danger: return t.danger
        case .hubSecondary: return .white
        }
    }

    private var background: Color {
        switch kind {
        case .primary: return t.primary
        case .sage: return t.sage
        case .ghost: return t.surface
        case .danger: return t.surface
        case .hubSecondary: return Color(red: 0.08, green: 0.055, blue: 0.03).opacity(0.45)
        }
    }

    private var strokeColor: Color {
        switch kind {
        case .ghost: return t.border2
        case .danger: return t.danger.opacity(0.5)
        case .primary: return t.tokens.shadowStyle == .hard ? t.border : .clear
        default: return .clear
        }
    }

    private var strokeWidth: CGFloat {
        switch kind {
        case .ghost, .danger: return t.bw
        case .primary: return t.tokens.shadowStyle == .hard ? t.bw : 0
        default: return 0
        }
    }
}

extension ButtonStyle where Self == BiteButtonStyle {
    static var bitePrimary: BiteButtonStyle { BiteButtonStyle(kind: .primary) }
    static var biteGhost: BiteButtonStyle { BiteButtonStyle(kind: .ghost) }
    static var biteSage: BiteButtonStyle { BiteButtonStyle(kind: .sage) }
    static func bite(_ kind: BiteButtonKind, full: Bool = false, compact: Bool = false) -> BiteButtonStyle {
        BiteButtonStyle(kind: kind, full: full, compact: compact)
    }
}

// MARK: - 药丸 / 标签 / 筛选

enum PillStyle { case want, visited, mute, primarySoft, sage, gold }

struct PillView: View {
    @Environment(\.bite) private var t
    var text: String
    var style: PillStyle = .mute

    var body: some View {
        Text(text)
            .font(t.text(11.5, weight: .semibold))
            .foregroundStyle(fg)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(bg)
            .clipShape(Capsule())
    }

    private var bg: Color {
        switch style {
        case .want, .gold: return t.goldSoft
        case .visited, .sage: return t.sageSoft
        case .mute: return t.sunken
        case .primarySoft: return t.primarySoft
        }
    }

    private var fg: Color {
        switch style {
        case .want, .gold: return t.goldTx
        case .visited, .sage: return t.sageTx
        case .mute: return t.muted
        case .primarySoft: return t.primarySoftTx
        }
    }
}

extension PlaceStatus {
    var pillStyle: PillStyle {
        switch self {
        case .wantToGo: return .want
        case .visited: return .visited
        case .archived: return .mute
        }
    }
}

/// 快捷评价档位的药丸（颜色与 v2.css 的 .v2-tier-N 一致）
struct TierPill: View {
    @Environment(\.bite) private var t
    var tier: PlaceTier?
    var placeholder: String = "评一下"

    var body: some View {
        Group {
            if let tier {
                Text(tier.label)
                    .font(t.text(11.5, weight: .bold))
                    .foregroundStyle(fg(tier))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(bg(tier))
                    .clipShape(Capsule())
            } else {
                Text(placeholder)
                    .font(t.text(11.5, weight: .bold))
                    .foregroundStyle(t.faint)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .overlay(Capsule().strokeBorder(style: StrokeStyle(lineWidth: t.bw, dash: [3, 2])).foregroundStyle(t.border2))
            }
        }
    }

    private func bg(_ tier: PlaceTier) -> Color {
        switch tier {
        case .top: return t.primary
        case .great: return t.goldSoft
        case .good: return t.sageSoft
        case .npc: return t.sunken
        case .bad: return t.dangerBg
        }
    }

    private func fg(_ tier: PlaceTier) -> Color {
        switch tier {
        case .top: return t.onPrimary
        case .great: return t.goldTx
        case .good: return t.sageTx
        case .npc: return t.muted
        case .bad: return t.dangerTx
        }
    }
}

/// 小标签（菜系 / 招牌菜）
struct TagView: View {
    @Environment(\.bite) private var t
    var text: String
    var primary: Bool = false

    var body: some View {
        Text(text)
            .font(t.text(11.5, weight: .semibold))
            .foregroundStyle(primary ? t.primarySoftTx : t.ink2)
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(primary ? t.primarySoft : t.surface2)
            .clipShape(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous))
    }
}

struct FilterChip: View {
    @Environment(\.bite) private var t
    var text: String
    var on: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(t.text(12, weight: .semibold))
                .foregroundStyle(on ? t.bg : t.ink2)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(on ? t.ink : t.surface)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(on ? t.ink : t.border2, lineWidth: t.bw))
        }
        .buttonStyle(.plain)
    }
}

/// 一行可横滚的筛选 chip
struct FilterRow<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) { content() }
                .padding(.horizontal, 16)
        }
        .padding(.horizontal, -16)
    }
}

// MARK: - 区块标题 / 空态 / 错误

struct SectionHeader: View {
    @Environment(\.bite) private var t
    var title: String
    var trailing: String? = nil
    var trailingOn: Bool = false
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(t.display(16)).foregroundStyle(t.ink)
            Spacer()
            if let trailing {
                if let action {
                    Button(action: action) {
                        Text(trailing).font(t.text(12.5, weight: .semibold)).foregroundStyle(trailingOn ? t.ink : t.link)
                    }
                } else {
                    Text(trailing).font(t.text(12.5, weight: .semibold)).foregroundStyle(t.link)
                }
            }
        }
        .padding(.top, 18)
        .padding(.bottom, 11)
    }
}

struct EmptyStateView: View {
    @Environment(\.bite) private var t
    var title: String
    var subtitle: String? = nil
    var icon: String? = nil

    var body: some View {
        VStack(spacing: 6) {
            if let icon {
                Image(systemName: icon).font(.system(size: 28)).foregroundStyle(t.faint).padding(.bottom, 8)
            }
            Text(title).font(t.display(18)).foregroundStyle(t.ink)
            if let subtitle {
                Text(subtitle).font(t.text(13.5)).foregroundStyle(t.muted).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
        .padding(.horizontal, 20)
    }
}

struct ErrorBanner: View {
    @Environment(\.bite) private var t
    var message: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 13)).padding(.top, 2)
            Text(message).font(t.text(14))
        }
        .foregroundStyle(t.dangerTx)
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.dangerBg)
        .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous).stroke(t.danger.opacity(0.25), lineWidth: 1))
    }
}

struct SuccessBanner: View {
    @Environment(\.bite) private var t
    var message: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark").font(.system(size: 13, weight: .semibold))
            Text(message).font(t.text(14))
        }
        .foregroundStyle(t.sageTx)
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.sageSoft)
        .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
    }
}

struct LoadingView: View {
    @Environment(\.bite) private var t
    var label: String = "加载中…"
    var body: some View {
        VStack(spacing: 10) {
            ProgressView().tint(t.primary)
            Text(label).font(t.text(13)).foregroundStyle(t.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

// MARK: - 头像 / 图片 / 星星

struct AvatarView: View {
    @Environment(\.bite) private var t
    var initial: String
    var sage: Bool = false
    var size: CGFloat = 28
    var url: String? = nil

    var body: some View {
        ZStack {
            if let url, let u = URL(string: url) {
                AsyncImage(url: u) { phase in
                    if case .success(let img) = phase { img.resizable().scaledToFill() } else { fallback }
                }
            } else {
                fallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var fallback: some View {
        ZStack {
            LinearGradient(colors: sage ? [t.sage, t.sageTx] : [t.primary, t.primaryDeep], startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(initial).font(t.text(size * 0.4, weight: .bold)).foregroundStyle(sage ? .white : t.onPrimary)
        }
    }
}

/// 远程图：自家 Storage 的 signed URL / 小红书 CDN 外链；失败显示占位
struct RemoteImage: View {
    @Environment(\.bite) private var t
    var url: String?
    var contentMode: ContentMode = .fill

    var body: some View {
        ZStack {
            t.surface2
            if let url, let u = URL(string: url) {
                AsyncImage(url: u) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().aspectRatio(contentMode: contentMode)
                    case .failure:
                        placeholder
                    default:
                        Color.clear
                    }
                }
            } else {
                placeholder
            }
        }
        .clipped()
    }

    private var placeholder: some View {
        Image(systemName: "fork.knife").font(.system(size: 22, weight: .light)).foregroundStyle(t.faint)
    }
}

struct StarsView: View {
    @Environment(\.bite) private var t
    var value: Double
    var size: CGFloat = 14

    var body: some View {
        let full = Int(value.rounded())
        HStack(spacing: 1) {
            ForEach(1...5, id: \.self) { i in
                Image(systemName: i <= full ? "star.fill" : "star")
                    .font(.system(size: size))
                    .foregroundStyle(i <= full ? t.gold : t.border2)
            }
        }
    }
}

// MARK: - Toast

struct ToastOverlay: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t

    var body: some View {
        if let toast = session.toast {
            HStack(spacing: 8) {
                Image(systemName: icon(toast.kind)).font(.system(size: 13, weight: .semibold))
                Text(toast.message).font(t.text(13.5, weight: .medium)).lineLimit(4)
            }
            .foregroundStyle(toast.kind == .error ? t.dangerTx : t.sageTx)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(toast.kind == .error ? t.dangerBg : t.sageSoft)
            .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
            .biteShadow(.card)
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
            .onTapGesture { session.toast = nil }
            .task(id: toast.id) {
                try? await Task.sleep(nanoseconds: UInt64((toast.kind == .error ? 4.5 : 2.8) * 1_000_000_000))
                if session.toast?.id == toast.id { withAnimation { session.toast = nil } }
            }
        }
    }

    private func icon(_ kind: Toast.Kind) -> String {
        switch kind {
        case .success: return "checkmark.circle.fill"
        case .error: return "exclamationmark.circle.fill"
        case .info: return "info.circle.fill"
        }
    }
}

// MARK: - 杂项

extension View {
    func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

/// 把「按 Enter 发送」的多行输入统一一下
struct GrowingTextEditor: View {
    @Environment(\.bite) private var t
    @Binding var text: String
    var placeholder: String
    var minLines: Int = 1
    var maxLines: Int = 6

    var body: some View {
        TextField(placeholder, text: $text, axis: .vertical)
            .lineLimit(minLines...maxLines)
            .biteField()
    }
}
