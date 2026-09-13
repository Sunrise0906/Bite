import SwiftUI
import BiteCore

struct VisitPrefill {
    var sentiment: VisitSentiment?
    var starRating: Int?
    var companions: String?
    /// 当前档位（挂在整家店上，不是某次造访）。nil = 还没评；表单要预填成当前值，否则提交会当成清空
    var tier: PlaceTier?
}

/// 「我去了」记一次造访 / 编辑造访（web 的 visit-log-form.tsx）
struct VisitLogSheet: View {
    enum Mode {
        case create(place: Place, prefill: VisitPrefill)
        case edit(log: VisitLog, displayMap: [String: String])
    }

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bite) private var t
    let mode: Mode
    var onSaved: () async -> Void

    @State private var sentiment: VisitSentiment = .willReturn
    @State private var star: Int?
    @State private var tier: PlaceTier?
    @State private var tierKnown = false
    @State private var initialTier: PlaceTier?
    @State private var date = Date()
    @State private var companions = ""
    @State private var note = ""
    @State private var photos: [String] = []        // canonical
    @State private var displayMap: [String: String] = [:]
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    section("体验") {
                        HStack(spacing: 8) {
                            ForEach(VisitSentiment.allCases, id: \.self) { s in
                                choice(selected: sentiment == s) { sentiment = s } label: {
                                    VStack(spacing: 4) {
                                        Image(systemName: icon(s)).font(.system(size: 18))
                                        Text(s.label).font(t.text(12, weight: .medium))
                                    }
                                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                                }
                            }
                        }
                    }
                    if tierKnown {
                        section("这家几档（可选）") {
                            HStack(spacing: 6) {
                                ForEach(PlaceTier.ordered, id: \.self) { x in
                                    choice(selected: tier == x) { tier = tier == x ? nil : x } label: {
                                        Text(x.label).font(t.text(12, weight: .semibold)).frame(maxWidth: .infinity).padding(.vertical, 8)
                                    }
                                }
                            }
                            Text("评的是这家店本身（换你以后再看还是这一档）；上面的「体验」记的是这一次。")
                                .font(t.text(11)).foregroundStyle(t.faint)
                        }
                    }
                    section("星级（可选）") {
                        HStack(spacing: 6) {
                            ForEach(1...5, id: \.self) { n in
                                Button { star = star == n ? nil : n } label: {
                                    Image(systemName: (star ?? 0) >= n ? "star.fill" : "star").font(.system(size: 24))
                                        .foregroundStyle((star ?? 0) >= n ? t.gold : t.border2)
                                }
                            }
                            if star != nil { Button("清除") { star = nil }.font(t.text(12)).foregroundStyle(t.muted).padding(.leading, 8) }
                        }
                    }
                    section("日期") {
                        DatePicker("", selection: $date, in: ...Date(), displayedComponents: .date).labelsHidden().tint(t.primary)
                    }
                    section("和谁去") {
                        TextField("女朋友 / 朋友 / 一个人...", text: $companions).biteField()
                    }
                    section("笔记（可选）") {
                        TextField("点了什么？等位多久？环境怎么样？", text: $note, axis: .vertical).lineLimit(3...8).biteField()
                    }
                    section("图片（可选）") {
                        PhotoStrip(photos: $photos, displayMap: $displayMap)
                    }
                    if let error { ErrorBanner(message: error) }
                }
                .padding(20)
            }
            .background(t.bg)
            .navigationTitle(isCreate ? "记一次造访" : "编辑造访记录")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "保存中…" : "保存") { Task { await save() } }.disabled(busy)
                }
            }
            .onAppear(perform: seed)
        }
    }

    private var isCreate: Bool { if case .create = mode { return true }; return false }

    private func seed() {
        switch mode {
        case .create(_, let p):
            sentiment = p.sentiment ?? .willReturn
            star = p.starRating
            companions = p.companions ?? ""
            tier = p.tier; initialTier = p.tier; tierKnown = true
        case .edit(let log, let map):
            sentiment = log.sentiment
            star = log.starRating
            companions = log.companions ?? ""
            note = log.note ?? ""
            photos = log.photos
            displayMap = map
            date = BiteDate.parse(log.visitedAt) ?? Date()
            tierKnown = false
        }
    }

    private func icon(_ s: VisitSentiment) -> String {
        switch s {
        case .willReturn: return "flame"
        case .okay: return "hand.thumbsup"
        case .wontReturn: return "hand.thumbsdown"
        }
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(t.text(11.5, weight: .semibold)).foregroundStyle(t.muted).textCase(.uppercase)
            content()
        }
    }

    private func choice<L: View>(selected: Bool, action: @escaping () -> Void, @ViewBuilder label: () -> L) -> some View {
        Button(action: action) {
            label()
                .foregroundStyle(selected ? t.primarySoftTx : t.muted)
                .background(selected ? t.primarySoft : t.surface)
                .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous).stroke(selected ? t.primary : t.border, lineWidth: t.bw))
        }
        .buttonStyle(.plain)
    }

    private func save() async {
        guard let uid = session.userId else { return }
        let noteText = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let comp = companions.trimmingCharacters(in: .whitespacesAndNewlines)
        if noteText.count > 1000 { error = "笔记不超过 1000 字"; return }
        if comp.count > 100 { error = "同行者不超过 100 字"; return }
        busy = true; error = nil
        defer { busy = false }
        // 日期拼成当天中午，防 UTC 偏移把「今天」打回前一天（同 web 的 parseVisitedAt）
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: date)
        comps.hour = 12
        let visitedAt = BiteDate.string(Calendar.current.date(from: comps) ?? date)
        var fields: [String: BiteJSON] = [
            "visited_at": .string(visitedAt),
            "sentiment": .string(sentiment.rawValue),
            "star_rating": .from(star),
            "note": .from(noteText.isEmpty ? nil : noteText),
            "companions": .from(comp.isEmpty ? nil : comp),
            "photos": .strings(photos),
        ]
        do {
            switch mode {
            case .create(let place, _):
                fields["place_id"] = .string(place.id)
                fields["user_id"] = .string(uid)
                _ = try await session.repos.visits.insert(fields)
                // 顺手更新档位（变了才写）
                if tierKnown, tier != initialTier {
                    if let tier { try? await session.repos.ratings.set(placeId: place.id, listId: place.listId, userId: uid, tier: tier) }
                    else { try? await session.repos.ratings.clear(placeId: place.id, userId: uid) }
                }
                // 首次 / 仍处于想去：自动翻成去过（失败不阻断）
                if place.status == .wantToGo { try? await session.repos.places.updateStatus(id: place.id, status: .visited) }
            case .edit(let log, _):
                try await session.repos.visits.update(id: log.id, userId: uid, fields: fields)
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }
}

/// 造访记录时间线（编辑页里）
struct VisitHistoryView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var place: Place
    var logs: [VisitLog]
    var canEdit: Bool
    var authors: [String: String]
    var displayMap: [String: String]
    var reload: () async -> Void

    @State private var editing: VisitLog?
    @State private var creating = false
    @State private var confirmDelete: VisitLog?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(logs.isEmpty ? "造访记录" : "造访记录 · \(logs.count)").font(t.display(18)).foregroundStyle(t.ink)
                Spacer()
                if canEdit { Button { creating = true } label: { Label("我去了", systemImage: "checkmark") }.buttonStyle(.bite(.ghost, compact: true)) }
            }
            if logs.isEmpty {
                Text("还没有造访记录。去过之后记一笔，AI 决策时会参考。")
                    .font(t.text(13)).foregroundStyle(t.muted).frame(maxWidth: .infinity).padding(.vertical, 20)
                    .biteCard(padding: 10)
            }
            ForEach(logs) { log in
                let own = log.userId == session.userId
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: icon(log.sentiment)).font(.system(size: 14))
                        .frame(width: 30, height: 30)
                        .background(log.sentiment == .willReturn ? t.primarySoft : log.sentiment == .okay ? t.sageSoft : t.surface2)
                        .foregroundStyle(log.sentiment == .willReturn ? t.primarySoftTx : log.sentiment == .okay ? t.sageTx : t.muted)
                        .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: 8) {
                            Text(RelDate.ymd(log.visitedAt)).font(t.text(14, weight: .medium)).foregroundStyle(t.ink)
                            Text(log.sentiment.label).font(t.text(12, weight: .medium)).foregroundStyle(t.sageTx)
                            if let s = log.starRating { StarsView(value: Double(s), size: 10) }
                            if !own { PillView(text: "@\(authors[log.userId] ?? "朋友")", style: .sage) }
                            Spacer()
                            if canEdit, own {
                                Button { editing = log } label: { Image(systemName: "pencil").font(.system(size: 12)) }.foregroundStyle(t.muted)
                                Button { confirmDelete = log } label: { Image(systemName: "trash").font(.system(size: 12)) }.foregroundStyle(t.danger)
                            }
                        }
                        if let c = log.companions, !c.isEmpty { Text("和 \(c)").font(t.text(12)).foregroundStyle(t.muted) }
                        if let n = log.note, !n.isEmpty { Text(n).font(t.text(14)).foregroundStyle(t.ink2) }
                        if !log.photos.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(Array(log.photos.enumerated()), id: \.offset) { _, u in
                                        RemoteImage(url: displayMap[u] ?? u).frame(width: 64, height: 64)
                                            .clipShape(RoundedRectangle(cornerRadius: t.radii.sm, style: .continuous))
                                    }
                                }
                            }
                        }
                    }
                }
                .biteCard(padding: 12, radius: t.radii.md)
            }
        }
        .sheet(item: $editing) { log in
            VisitLogSheet(mode: .edit(log: log, displayMap: displayMap), onSaved: reload)
        }
        .sheet(isPresented: $creating) {
            let own = logs.first { $0.userId == session.userId }
            VisitLogSheet(mode: .create(place: place, prefill: VisitPrefill(sentiment: own?.sentiment, starRating: own?.starRating, companions: own?.companions, tier: nil)), onSaved: reload)
        }
        .confirmationDialog("删除这条造访记录？无法撤销。",
                            isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
                            titleVisibility: .visible) {
            Button("删除", role: .destructive) { if let l = confirmDelete { Task { await delete(l) } } }
        }
    }

    private func icon(_ s: VisitSentiment) -> String {
        switch s {
        case .willReturn: return "flame.fill"
        case .okay: return "hand.thumbsup.fill"
        case .wontReturn: return "hand.thumbsdown.fill"
        }
    }

    private func delete(_ log: VisitLog) async {
        guard let uid = session.userId else { return }
        do { try await session.repos.visits.delete(id: log.id, userId: uid); await reload() }
        catch { session.showError(error) }
    }
}
