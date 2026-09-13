import SwiftUI
import BiteCore

/// 收件箱（web 的 /recommendations）：待处理 / 已处理 / 我发出的
struct RecommendationsView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @State private var incoming: [Recommendation] = []
    @State private var outgoing: [Recommendation] = []
    @State private var names: [String: String] = [:]
    @State private var lists: [QuickAddModel.WritableList] = []
    @State private var loaded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("朋友推荐的店 · 你发出的推荐").font(t.text(13)).foregroundStyle(t.muted).padding(.top, 8)
                let pending = incoming.filter { $0.status == .pending }
                let resolved = incoming.filter { $0.status != .pending }
                SectionHeader(title: "待处理", trailing: "收到 \(pending.count) 条")
                if pending.isEmpty {
                    EmptyStateView(title: "没有待处理的推荐", icon: "tray").biteCard(padding: 0)
                } else {
                    VStack(spacing: 10) { ForEach(pending) { r in card(r, incoming: true) } }
                }
                if !resolved.isEmpty {
                    SectionHeader(title: "已处理", trailing: "收到的推荐")
                    VStack(spacing: 10) { ForEach(resolved) { r in card(r, incoming: true) } }
                }
                if !outgoing.isEmpty {
                    SectionHeader(title: "我发出的")
                    VStack(spacing: 10) { ForEach(outgoing) { r in card(r, incoming: false) } }
                }
                if loaded, incoming.isEmpty, outgoing.isEmpty {
                    EmptyStateView(title: "还没有任何推荐", subtitle: "在店铺详情页右上角可以推荐给朋友", icon: "tray").biteCard(padding: 0).padding(.top, 12)
                }
            }
            .bitePage()
            .padding(.bottom, 28)
        }
        .background(t.bg)
        .navigationTitle("收件箱")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .overlay { if !loaded { LoadingView() } }
    }

    private func card(_ r: Recommendation, incoming: Bool) -> some View {
        RecommendationCard(rec: r, fromLabel: names[incoming ? r.fromUserId : r.toUserId] ?? "朋友",
                           direction: incoming ? .incoming : .outgoing, lists: lists, reload: load)
    }

    private func load() async {
        guard let uid = session.userId else { return }
        do {
            async let inc = session.repos.recommendations.incoming(userId: uid)
            async let out = session.repos.recommendations.outgoing(userId: uid)
            async let ls = session.repos.lists.fetchAll()
            let (i, o, l) = try await (inc, out, ls)
            incoming = i; outgoing = o
            let members = try await session.repos.lists.members(listIds: l.map(\.id))
            let coOwner = Set(members.filter { $0.userId == uid && $0.role == .coOwner }.map(\.listId))
            lists = l.filter { $0.ownerId == uid || coOwner.contains($0.id) }.map { .init(id: $0.id, name: $0.name, isOwner: $0.ownerId == uid, category: $0.category) }
            let ids = Set(i.map(\.fromUserId) + o.map(\.toUserId))
            let profiles = try await session.repos.profiles.fetch(ids: Array(ids))
            names = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.displayName) })
        } catch { session.showError(error) }
        loaded = true
    }
}

struct RecommendationCard: View {
    enum Direction { case incoming, outgoing }
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var rec: Recommendation
    var fromLabel: String
    var direction: Direction
    var lists: [QuickAddModel.WritableList]
    var reload: () async -> Void

    @State private var picking = false
    @State private var targetListId = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let p = rec.placeData
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Text(direction == .incoming ? "来自" : "给").font(t.text(12)).foregroundStyle(t.muted)
                        Text("@\(fromLabel)").font(t.text(12, weight: .medium)).foregroundStyle(t.ink2)
                        Text(RelDate.relativeTime(rec.createdAt)).font(t.text(12)).foregroundStyle(t.faint)
                    }
                    Text(p.name).font(t.text(16, weight: .semibold)).foregroundStyle(t.ink)
                    Text(p.address).font(t.text(13)).foregroundStyle(t.muted)
                }
                Spacer()
                PillView(text: rec.status.label, style: rec.status == .pending ? .want : rec.status == .accepted ? .visited : .mute)
            }
            if !p.cuisine.isEmpty {
                FlowLayout(spacing: 5) {
                    ForEach(p.cuisine, id: \.self) { TagView(text: $0) }
                    if let pr = p.priceRange { TagView(text: pr.rawValue) }
                }
            }
            if let m = p.message, !m.isEmpty {
                Text("「\(m)」").font(t.text(13)).italic().foregroundStyle(t.ink2)
                    .padding(.horizontal, 10).padding(.vertical, 6).frame(maxWidth: .infinity, alignment: .leading)
                    .background(t.surface2).clipShape(RoundedRectangle(cornerRadius: t.radii.xs))
            }
            if let n = p.notes, !n.isEmpty {
                Label(n, systemImage: "sparkles").font(t.text(12)).foregroundStyle(t.muted).lineLimit(2)
            }
            if let error { ErrorBanner(message: error) }
            if rec.status == .pending, direction == .incoming {
                if picking {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("加到哪个 list").font(t.text(11.5, weight: .semibold)).foregroundStyle(t.muted)
                        ListPicker(lists: lists, selected: $targetListId)
                        HStack {
                            Spacer()
                            Button("取消") { picking = false }.buttonStyle(.bite(.ghost, compact: true))
                            Button(busy ? "加入中…" : "确认加入") { Task { await accept() } }.buttonStyle(.bite(.primary, compact: true)).disabled(busy || targetListId.isEmpty)
                        }
                    }
                    .padding(12).background(t.surface2).clipShape(RoundedRectangle(cornerRadius: t.radii.md))
                } else {
                    HStack(spacing: 8) {
                        Button(lists.isEmpty ? "你还没 list" : "接受 + 加入…") { targetListId = lists.first?.id ?? ""; picking = true }
                            .buttonStyle(.bite(.primary, compact: true)).disabled(busy || lists.isEmpty)
                        Button("拒绝") { Task { await decline() } }.buttonStyle(.bite(.ghost, compact: true)).disabled(busy)
                    }
                }
            }
            if rec.status == .pending, direction == .outgoing {
                Button("撤回") { Task { await withdraw() } }.buttonStyle(.bite(.danger, compact: true)).disabled(busy)
            }
        }
        .biteCard(padding: 14)
        .overlay(alignment: .leading) { if rec.status == .pending { RoundedRectangle(cornerRadius: 2).fill(t.gold).frame(width: 4).padding(.vertical, 12) } }
    }

    private func accept() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let r = try await session.api.acceptRecommendation(id: rec.id, targetListId: targetListId)
            session.showToast(r.merged ? "已合并到已有店铺" : "已添加店铺")
            await reload()
            session.router.listsPath = [.list(r.listId)]
            session.router.tab = .lists
        } catch { self.error = ErrorText.friendly(error) }
    }

    private func decline() async {
        busy = true; error = nil
        defer { busy = false }
        do { try await session.repos.recommendations.decline(id: rec.id); await reload() } catch { self.error = ErrorText.friendly(error) }
    }

    private func withdraw() async {
        busy = true; error = nil
        defer { busy = false }
        do { try await session.repos.recommendations.withdraw(id: rec.id); await reload() } catch { self.error = ErrorText.friendly(error) }
    }
}
