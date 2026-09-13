import SwiftUI
import Supabase
import BiteCore

/// 「一起选」滑卡（web 的 pick-deck.tsx）：右滑=想吃♥，左滑=跳过✗。够多数的人右滑同一家 → 就它了。
struct PickDeckView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    let listId: String
    @State private var data: PickSessionData?
    @State private var cards: [PickCard] = []
    @State private var likes: [String] = []
    @State private var matched: PickMatched?
    @State private var error: String?
    @State private var drag: CGSize = .zero
    @State private var flying: Bool? // true = right
    @State private var busy = false
    @State private var pollTask: Task<Void, Never>?

    private var duo: Bool { (data?.memberCount ?? 1) > 1 }
    private var need: Int { PickRules.votesNeeded(memberCount: data?.memberCount ?? 1) }
    private var finished: Bool { cards.isEmpty && matched == nil && data != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                Text("一起选").font(t.display(25)).foregroundStyle(t.ink)
                if let d = data {
                    Text("\(d.listName) · " + (d.memberCount > 1 ? "\(d.memberCount) 个人里有 \(need) 个右滑同一家，就它了" : "右滑收藏，滑完随机挑一家"))
                        .font(t.text(13)).foregroundStyle(t.muted)
                }
            }
            .padding(.top, 12).padding(.bottom, 10)

            if let error {
                EmptyStateView(title: "进不去一起选", subtitle: error)
            } else if data == nil {
                LoadingView()
            } else if let m = matched {
                result(m)
            } else if cards.isEmpty {
                finishedView
            } else {
                deck
            }
            Spacer(minLength: 0)
        }
        .bitePage()
        .background(t.bg)
        .navigationTitle("一起选")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: finished) { _, f in if f, duo { startPolling() } else { pollTask?.cancel() } }
        .onDisappear { pollTask?.cancel() }
    }

    private var deck: some View {
        VStack(spacing: 14) {
            Text("剩 \(cards.count) 家" + (duo ? " · \(need) 个人右滑就它" : "")).font(t.text(12.5)).foregroundStyle(t.muted)
            ZStack {
                if cards.count > 1 { CardFace(card: cards[1]).scaleEffect(0.95).offset(y: 10).opacity(0.7) }
                if let top = cards.first {
                    let dx = flying == true ? 480 : flying == false ? -480 : drag.width
                    CardFace(card: top)
                        .overlay(alignment: .topLeading) { if dx > 40 { stamp("想吃", color: t.sage, rotate: -8).padding(16) } }
                        .overlay(alignment: .topTrailing) { if dx < -40 { stamp("跳过", color: t.danger, rotate: 8).padding(16) } }
                        .offset(x: dx, y: drag.height * 0.3)
                        .rotationEffect(.degrees(Double(dx) / 18))
                        .opacity(flying != nil ? 0 : 1)
                        .animation(flying != nil ? .easeIn(duration: 0.22) : .interactiveSpring(), value: dx)
                        .gesture(
                            DragGesture()
                                .onChanged { drag = $0.translation }
                                .onEnded { v in
                                    if abs(v.translation.width) > 90 { Task { await vote(top, yes: v.translation.width > 0) } }
                                    else { withAnimation { drag = .zero } }
                                }
                        )
                }
            }
            .frame(height: 440)
            HStack(spacing: 22) {
                actionButton("xmark", color: t.danger) { if let top = cards.first { Task { await vote(top, yes: false) } } }
                actionButton("heart.fill", color: t.sage) { if let top = cards.first { Task { await vote(top, yes: true) } } }
            }
        }
    }

    private func stamp(_ text: String, color: Color, rotate: Double) -> some View {
        Text(text).font(t.text(15, weight: .heavy)).foregroundStyle(color)
            .padding(.horizontal, 12).padding(.vertical, 5)
            .background(t.surface).overlay(RoundedRectangle(cornerRadius: t.radii.xs).stroke(color, lineWidth: 2.5))
            .rotationEffect(.degrees(rotate))
    }

    private func actionButton(_ icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 24, weight: .semibold)).foregroundStyle(color)
                .frame(width: 60, height: 60).background(t.surface).clipShape(Circle())
                .overlay(Circle().stroke(color.opacity(0.4), lineWidth: 2))
                .biteShadow(.card)
        }
        .disabled(busy || flying != nil)
    }

    private var finishedView: some View {
        VStack(spacing: 10) {
            Text(duo ? "⏳" : "🍜").font(.system(size: 44))
            if duo {
                Text("你滑完了").font(t.display(28)).foregroundStyle(t.ink)
                Text("右滑了 \(likes.count) 家 · 等其他人滑完，一旦有 \(need) 个人想吃同一家会立刻揭晓").font(t.text(13.5)).foregroundStyle(t.muted).multilineTextAlignment(.center)
                Button("刷新看看") { Task { await load() } }.buttonStyle(.bite(.ghost)).padding(.top, 12)
            } else {
                Text(likes.isEmpty ? "都没看上？" : "选中 \(likes.count) 家").font(t.display(28)).foregroundStyle(t.ink)
                if !likes.isEmpty {
                    Button("从右滑里随机就它") {
                        if let id = likes.randomElement() { session.router.listsPath.append(.place(listId: listId, placeId: id)) }
                    }
                    .buttonStyle(.bite(.primary)).padding(.top, 12)
                }
                Button("再来一轮") { Task { await restart() } }.buttonStyle(.bite(.ghost)).disabled(busy)
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 60)
    }

    private func result(_ m: PickMatched) -> some View {
        VStack(spacing: 10) {
            Text("🎉").font(.system(size: 44))
            Text("你们都想吃").font(t.text(13)).foregroundStyle(t.muted)
            Text(m.name.isEmpty ? "就它了" : m.name).font(t.display(30)).foregroundStyle(t.ink).multilineTextAlignment(.center)
            HStack(spacing: 10) {
                Button("就它了 · 看详情") { session.router.listsPath.append(.place(listId: listId, placeId: m.placeId)) }.buttonStyle(.bite(.primary))
                Button(busy ? "开新一轮…" : "再来一轮") { Task { await restart() } }.buttonStyle(.bite(.ghost)).disabled(busy)
            }
            .padding(.top, 14)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 60)
    }

    private func load() async {
        do {
            let d = try await session.api.pickSession(listId: listId)
            apply(d)
        } catch { self.error = ErrorText.friendly(error) }
    }

    private func apply(_ d: PickSessionData) {
        data = d; cards = d.cards; likes = d.myLikes
        matched = d.status == "done" ? d.matchedPlaceId.map { PickMatched(placeId: $0, name: "") } : nil
        if let m = matched, m.name.isEmpty { Task { await fillName(m.placeId) } }
    }

    private func fillName(_ placeId: String) async {
        if let p = try? await session.repos.places.fetch(id: placeId) { matched = PickMatched(placeId: placeId, name: p.name) }
    }

    private func vote(_ card: PickCard, yes: Bool) async {
        guard flying == nil, let d = data else { return }
        flying = yes
        if yes { likes.append(card.placeId) }
        try? await Task.sleep(nanoseconds: 220_000_000)
        cards.removeAll { $0.placeId == card.placeId }
        flying = nil; drag = .zero
        do {
            let r = try await session.api.pickVote(sessionId: d.sessionId, placeId: card.placeId, vote: yes)
            if let m = r.matched { matched = m }
        } catch {
            if yes { likes.removeAll { $0 == card.placeId } }
            session.showError(error)
        }
    }

    private func restart() async {
        guard let d = data else { return }
        busy = true; defer { busy = false }
        do { apply(try await session.api.pickRestart(listId: listId, sessionId: d.sessionId)); matched = nil }
        catch { session.showError(error) }
    }

    /// 滑完等其他人：每 4 秒看一次 session 有没有结束
    private func startPolling() {
        pollTask?.cancel()
        guard let d = data else { return }
        let client = session.supabase
        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                struct Row: Decodable { var status: String; var matchedPlaceId: String?; enum CodingKeys: String, CodingKey { case status; case matchedPlaceId = "matched_place_id" } }
                let rows: [Row] = (try? await client.from("pick_sessions").select("status, matched_place_id").eq("id", value: d.sessionId).execute().value) ?? []
                if let r = rows.first, r.status == "done" {
                    if let pid = r.matchedPlaceId {
                        matched = PickMatched(placeId: pid, name: "")
                        await fillName(pid)
                    } else {
                        await load() // 别人点了再来一轮：重挂进新 session
                    }
                    break
                }
            }
        }
    }
}

private struct CardFace: View {
    @Environment(\.bite) private var t
    var card: PickCard

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RemoteImage(url: card.photo).frame(maxWidth: .infinity).frame(height: 300)
            VStack(alignment: .leading, spacing: 4) {
                Text(card.name).font(t.display(21)).foregroundStyle(t.ink)
                Text([card.cuisine.first, card.priceRange, card.googleRating.map { "★\(String(format: "%.1f", $0))" }].compactMap { $0 }.joined(separator: " · ").ifEmpty("—"))
                    .font(t.text(12.5)).foregroundStyle(t.muted)
                if let r = card.reason { Text("“\(r)”").font(t.text(12.5)).foregroundStyle(t.ink2).lineLimit(2).padding(.top, 4) }
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity)
        .background(t.surface)
        .clipShape(RoundedRectangle(cornerRadius: t.radii.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: t.radii.xl, style: .continuous).stroke(t.border, lineWidth: t.bw))
        .biteShadow(.card)
    }
}
