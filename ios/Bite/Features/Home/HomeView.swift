import SwiftUI
import BiteCore

/// 主页 = 决策中枢（web 的 components/v2/home-v2.tsx）
struct HomeView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @State private var model = HomeModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                QuickAddBar(targetListId: nil).padding(.bottom, 16)
                hub
                if model.deck.isEmpty {
                    if !model.lists.isEmpty { emptyDeckHint }
                } else {
                    DeckSection(deck: model.deck, totalWant: model.totalWant)
                }
                MyListsSection(lists: model.lists, reload: { await model.load(session) })
                CreateListRow(onCreated: { await model.load(session) })
                if let e = model.error { ErrorBanner(message: e).padding(.top, 12) }
            }
            .bitePage()
            .padding(.bottom, 28)
        }
        .background(t.bg)
        .refreshable { await model.load(session) }
        .task { await model.load(session) }
        .onChange(of: session.router.quickAddSeed) { old, new in
            // 智能添加 sheet 关掉后刷新
            if old != nil, new == nil { Task { await model.load(session) } }
        }
        .navigationBarHidden(true)
        .overlay {
            if model.isLoading && !model.loadedOnce { LoadingView() }
        }
    }

    private var topBar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text("欢迎回来").font(t.text(13)).foregroundStyle(t.muted)
                Text(session.displayName).font(t.display(20)).foregroundStyle(t.ink)
            }
            Spacer()
            AvatarView(initial: String(session.displayName.prefix(1)).uppercased(), size: 38, url: session.profile?.avatarUrl)
        }
        .padding(.top, 22).padding(.bottom, 14)
    }

    private var hub: some View {
        let bg = model.deck.first { $0.photo != nil }?.photo ?? model.heroPhoto
        return ZStack(alignment: .bottomLeading) {
            if let bg {
                RemoteImage(url: bg).frame(height: 200)
            } else {
                LinearGradient(colors: [t.primary, t.primaryDeep], startPoint: .topLeading, endPoint: .bottomTrailing).frame(height: 200)
            }
            LinearGradient(colors: [Color(red: 0.11, green: 0.07, blue: 0.04).opacity(0.85), Color(red: 0.11, green: 0.07, blue: 0.04).opacity(0.35)],
                           startPoint: .leading, endPoint: .trailing)
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "clock").font(.system(size: 11, weight: .semibold))
                        Text("\(model.totalPlaces) 家店 · 想去 \(model.totalWant) 家")
                    }
                    .font(t.text(11.5, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
                    Text("今晚，\n吃哪一家？").font(t.display(25)).foregroundStyle(.white).lineSpacing(2)
                }
                HStack(spacing: 9) {
                    Button {
                        session.router.tab = .chat
                        session.router.chatPath = [.conversation(id: nil, scopeListId: nil)]
                    } label: {
                        Label("帮我决定", systemImage: "sparkles").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bite(.primary, full: true))
                    Button {
                        if let d = model.deck.randomElement() {
                            session.router.listsPath.append(.place(listId: d.listId, placeId: d.placeId))
                        } else {
                            session.router.tab = .chat
                        }
                    } label: { Text("随便选") }
                    .buttonStyle(.bite(.hubSecondary))
                }
            }
            .padding(18)
        }
        .frame(height: 200)
        .clipShape(RoundedRectangle(cornerRadius: t.radii.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: t.radii.xl, style: .continuous).stroke(t.border, lineWidth: t.bw))
        .biteShadow(.card)
        .padding(.bottom, 8)
    }

    private var emptyDeckHint: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "想去 · 帮你前置了")
            Button {
                session.router.tab = .chat
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("还没有「想去」的店").font(t.text(14.5, weight: .bold)).foregroundStyle(t.ink)
                        Text("加几家想去的，纠结时我帮你从里面挑").font(t.text(11.5)).foregroundStyle(t.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(t.faint)
                }
                .biteCard(padding: 11, radius: t.radii.md)
            }
            .buttonStyle(.plain)
        }
    }
}

/// 统一加店入口（点开就是智能添加 sheet：粘小红书 / 写几句话 / 拍照 / 搜店名）
struct QuickAddBar: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var targetListId: String?

    var body: some View {
        Button {
            session.router.quickAddSeed = QuickAddSeed(targetListId: targetListId)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(t.faint)
                Text("粘贴小红书链接、写几句话、或搜店名…").font(t.text(15)).foregroundStyle(t.faint).lineLimit(1)
                Spacer()
                Image(systemName: "camera").foregroundStyle(t.muted)
            }
            .padding(.horizontal, 14).padding(.vertical, 13)
            .background(t.surface)
            .clipShape(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous).stroke(t.border2, lineWidth: t.bw))
            .biteShadow(.small)
        }
        .buttonStyle(.plain)
    }
}

/// 想去 deck（横向卡片 + 菜系筛选）
struct DeckSection: View {
    @Environment(\.bite) private var t
    var deck: [HomeModel.DeckItem]
    var totalWant: Int
    @State private var active: String?

    private var cuisines: [String] {
        var count: [String: Int] = [:]
        for d in deck { for c in d.cuisine { count[c, default: 0] += 1 } }
        return count.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }.prefix(5).map(\.key)
    }

    private var filtered: [HomeModel.DeckItem] {
        guard let a = active else { return deck }
        return deck.filter { $0.cuisine.contains(a) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "想去 · 帮你前置了", trailing: "\(totalWant) 家")
            if !cuisines.isEmpty {
                FilterRow {
                    FilterChip(text: "全部", on: active == nil) { active = nil }
                    ForEach(cuisines, id: \.self) { c in
                        FilterChip(text: c, on: active == c) { active = active == c ? nil : c }
                    }
                }
                .padding(.bottom, 12)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(filtered) { d in
                        NavigationLink(value: AppRoute.place(listId: d.listId, placeId: d.placeId)) {
                            DeckCard(item: d)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 6)
            }
            .padding(.horizontal, -16)
        }
    }
}

private struct DeckCard: View {
    @Environment(\.bite) private var t
    var item: HomeModel.DeckItem

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RemoteImage(url: item.photo).frame(width: 156, height: 96)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(t.text(14, weight: .bold)).foregroundStyle(t.ink).lineLimit(1)
                Text([item.cuisine.first, item.price].compactMap { $0 }.joined(separator: " · ").ifEmpty("—"))
                    .font(t.text(11)).foregroundStyle(t.muted)
                Text(item.reason.map { "“\($0)”" } ?? " ")
                    .font(t.text(11.5)).foregroundStyle(t.ink2).lineLimit(2)
                    .frame(minHeight: 31, alignment: .top).padding(.top, 5)
                HStack(spacing: 6) {
                    Text("就它").font(t.text(11.5, weight: .bold)).foregroundStyle(t.onPrimary)
                        .frame(maxWidth: .infinity).padding(.vertical, 7)
                        .background(t.primary).clipShape(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous))
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(t.ink2)
                        .frame(width: 34, height: 30)
                        .overlay(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous).stroke(t.border2, lineWidth: t.bw))
                }
                .padding(.top, 9)
            }
            .padding(EdgeInsets(top: 10, leading: 11, bottom: 11, trailing: 11))
        }
        .frame(width: 156)
        .background(t.surface)
        .clipShape(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous).stroke(t.border, lineWidth: t.bw))
        .biteShadow(.small)
    }
}

extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
