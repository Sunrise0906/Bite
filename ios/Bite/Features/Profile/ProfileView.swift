import SwiftUI
import UserNotifications
import BiteCore

/// 我的（web 的 /profile）：资料 / 外观 / 通知 / AI 用量 / AI 模型设置 / 收件箱 / 足迹 / 退出
struct ProfileView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @State private var editing = false
    @State private var pendingRecs = 0
    @State private var usage: (monthIn: Int, monthOut: Int, allIn: Int, allOut: Int, turns: Int) = (0, 0, 0, 0, 0)
    @State private var notifStatus: UNAuthorizationStatus = .notDetermined
    @State private var notifBusy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("我的").font(t.display(28)).foregroundStyle(t.ink).padding(.top, 12)

                // 资料
                HStack(spacing: 14) {
                    AvatarView(initial: String(session.displayName.prefix(1)).uppercased(), size: 56, url: session.profile?.avatarUrl)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(session.displayName).font(t.text(16, weight: .medium)).foregroundStyle(t.ink)
                        Text(session.email ?? "").font(t.text(13)).foregroundStyle(t.muted)
                    }
                    Spacer()
                    Button { editing = true } label: { Label("编辑", systemImage: "pencil") }.buttonStyle(.bite(.ghost, compact: true))
                }
                .biteCard(padding: 16)

                // 外观
                card("外观") {
                    Text("主题风格（整套设计语言，不只换色）").font(t.text(12, weight: .semibold)).foregroundStyle(t.muted)
                    ThemePicker()
                }

                // 通知
                card("通知") {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(notifStatus == .authorized ? "推送通知已开启" : "接收推送通知").font(t.text(14)).foregroundStyle(t.ink)
                            Text("收到朋友推荐 / 共享清单加新店 / 一起选匹配 / 留言时提醒你").font(t.text(12)).foregroundStyle(t.muted)
                        }
                        Spacer()
                        if notifStatus == .denied {
                            Button("去设置") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }
                                .buttonStyle(.bite(.ghost, compact: true))
                        } else if notifStatus != .authorized {
                            Button(notifBusy ? "…" : "开启") { Task { await enableNotifications() } }.buttonStyle(.bite(.primary, compact: true)).disabled(notifBusy)
                        }
                    }
                }

                // AI 用量
                card("AI 用量", trailing: usage.turns > 0 ? "\(usage.turns) 轮对话" : "还没有数据") {
                    HStack(spacing: 10) {
                        usageBox("本月", usage.monthIn, usage.monthOut)
                        usageBox("全部", usage.allIn, usage.allOut)
                    }
                    Text("tokens 直接来自 provider 返回。Gemini 在免费 tier 内不计费；其他 provider 自带 key 时按各自计费。")
                        .font(t.text(11)).foregroundStyle(t.faint)
                }

                // 入口
                VStack(spacing: 10) {
                    NavigationLink(value: AppRoute.llmSettings) { entryRow(icon: "cpu", title: "AI 模型设置", sub: "选 provider / 填自己的 key") }
                    NavigationLink(value: AppRoute.recommendations) {
                        entryRow(icon: "tray", title: "收件箱", sub: "朋友推荐的店", badge: pendingRecs)
                    }
                    NavigationLink(value: AppRoute.stats) { entryRow(icon: "chart.bar", title: "吃喝足迹", sub: "菜系分布 · 造访趋势 · 最爱") }
                }
                .buttonStyle(.plain)

                Button("退出登录") { Task { await session.signOut() } }.buttonStyle(.bite(.ghost, full: true)).padding(.top, 8)
                Text("Bite iOS · 数据与网页版同步").font(t.text(11)).foregroundStyle(t.faint).frame(maxWidth: .infinity)
            }
            .bitePage()
            .padding(.bottom, 28)
        }
        .background(t.bg)
        .navigationBarHidden(true)
        .refreshable { await load() }
        .task { await load() }
        .sheet(isPresented: $editing) { ProfileEditSheet().presentationDetents([.medium]) }
    }

    private func card<C: View>(_ title: String, trailing: String? = nil, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(t.display(18)).foregroundStyle(t.ink)
                Spacer()
                if let trailing { Text(trailing).font(t.text(12)).foregroundStyle(t.muted) }
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .biteCard(padding: 16)
    }

    private func usageBox(_ label: String, _ i: Int, _ o: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(t.text(12, weight: .medium)).foregroundStyle(t.muted)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text((i + o).formatted()).font(t.display(20)).foregroundStyle(t.ink)
                Text("tokens").font(t.text(11)).foregroundStyle(t.muted)
            }
            Text("in \(i.formatted()) · out \(o.formatted())").font(t.text(11)).foregroundStyle(t.faint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12).background(t.surface2).clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
    }

    private func entryRow(icon: String, title: String, sub: String, badge: Int = 0) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(t.primary)
            Text(title).font(t.text(14, weight: .medium)).foregroundStyle(t.ink)
            Text(sub).font(t.text(13)).foregroundStyle(t.muted).lineLimit(1)
            if badge > 0 {
                Text("\(badge)").font(t.text(11, weight: .semibold)).foregroundStyle(t.onPrimary)
                    .padding(.horizontal, 6).padding(.vertical, 2).background(t.primary).clipShape(Capsule())
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 13)).foregroundStyle(t.faint)
        }
        .biteCard(padding: 14)
    }

    private func load() async {
        guard let uid = session.userId else { return }
        await session.loadProfile()
        pendingRecs = (try? await session.repos.recommendations.pendingCount(userId: uid)) ?? 0
        notifStatus = await PushService.shared.authorizationStatus()
        if let rows = try? await session.repos.chat.usageRows() {
            let monthStart = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: Date())) ?? Date()
            var u = (0, 0, 0, 0, 0)
            for r in rows {
                guard let usage = r.usage?.objectValue else { continue }
                let i = usage["input_tokens"]?.intValue ?? 0
                let o = usage["output_tokens"]?.intValue ?? 0
                u.2 += i; u.3 += o; u.4 += 1
                if let d = BiteDate.parse(r.createdAt), d >= monthStart { u.0 += i; u.1 += o }
            }
            usage = u
        }
    }

    private func enableNotifications() async {
        notifBusy = true
        defer { notifBusy = false }
        _ = await PushService.shared.requestAuthorizationAndRegister()
        notifStatus = await PushService.shared.authorizationStatus()
    }
}

/// 四套主题选择
struct ThemePicker: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            ForEach(BiteTheme.allCases, id: \.self) { theme in
                let on = session.theme == theme
                Button { withAnimation { session.theme = theme } } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            ForEach(theme.dots, id: \.self) { hex in
                                RoundedRectangle(cornerRadius: 5).fill(Color(hex: hex)).frame(width: 16, height: 16)
                                    .overlay(RoundedRectangle(cornerRadius: 5).stroke(t.border2, lineWidth: 1))
                            }
                        }
                        .padding(.bottom, 4)
                        Text(theme.label).font(t.text(13.5, weight: .bold)).foregroundStyle(t.ink)
                        Text(theme.subtitle).font(t.text(11)).foregroundStyle(t.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(t.surface)
                    .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous).stroke(on ? t.primary : t.border, lineWidth: on ? 2 : t.bw))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct ProfileEditSheet: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bite) private var t
    @State private var name = ""
    @State private var avatar = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("编辑资料").font(t.display(20)).foregroundStyle(t.ink)
            Text("显示名字").font(t.text(12, weight: .semibold)).foregroundStyle(t.muted)
            TextField(session.email?.split(separator: "@").first.map(String.init) ?? "", text: $name).biteField()
            Text("朋友在推荐 / 共享 list 时看到这个名字。留空使用邮箱前缀。").font(t.text(11)).foregroundStyle(t.faint)
            Text("头像 URL（可选）").font(t.text(12, weight: .semibold)).foregroundStyle(t.muted)
            TextField("https://...", text: $avatar).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().biteField()
            if let error { ErrorBanner(message: error) }
            HStack {
                Spacer()
                Button("取消") { dismiss() }.buttonStyle(.bite(.ghost))
                Button(busy ? "保存中…" : "保存") { Task { await save() } }.buttonStyle(.bite(.primary)).disabled(busy)
            }
            Spacer()
        }
        .padding(20)
        .background(t.bg)
        .onAppear { name = session.profile?.name ?? ""; avatar = session.profile?.avatarUrl ?? "" }
    }

    private func save() async {
        guard let uid = session.userId else { return }
        let n = name.trimmingCharacters(in: .whitespaces)
        let a = avatar.trimmingCharacters(in: .whitespaces)
        if n.count > 60 { error = "名字不超过 60 字"; return }
        if !a.isEmpty, !a.lowercased().hasPrefix("http") { error = "头像 URL 必须以 http(s):// 开头"; return }
        busy = true; error = nil
        defer { busy = false }
        do {
            try await session.repos.profiles.update(id: uid, name: n.isEmpty ? nil : n, avatarUrl: a.isEmpty ? nil : a)
            await session.loadProfile()
            session.showToast("已保存")
            dismiss()
        } catch { self.error = ErrorText.friendly(error) }
    }
}
