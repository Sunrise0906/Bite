import SwiftUI
import BiteCore

/// 店铺详情（web 的 components/v2/place-detail-v2.tsx）
struct PlaceDetailView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    let listId: String
    let placeId: String
    @State private var model = PlaceDetailModel()
    @State private var showVisit = false
    @State private var showRecommend = false

    var body: some View {
        ScrollView {
            if let place = model.place {
                VStack(alignment: .leading, spacing: 0) {
                    hero(place)
                    detailContent(place)
                }
            } else if model.notFound {
                EmptyStateView(title: "找不到这家店", subtitle: "可能已被删除")
            } else if let e = model.error {
                ErrorBanner(message: e).padding()
            } else {
                LoadingView()
            }
        }
        .background(t.bg)
        .navigationTitle(model.place?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if model.canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        NavigationLink(value: AppRoute.placeForm(listId: listId, placeId: placeId)) { Label("编辑", systemImage: "pencil") }
                        Button { showRecommend = true } label: { Label("推荐给朋友", systemImage: "paperplane") }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            } else {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showRecommend = true } label: { Image(systemName: "paperplane") }
                }
            }
        }
        .refreshable { await reload() }
        .task(id: placeId) {
            model.currentUserId = session.userId ?? ""
            await model.load(session, listId: listId, placeId: placeId)
        }
        .sheet(isPresented: $showVisit) {
            if let place = model.place {
                VisitLogSheet(mode: .create(place: place, prefill: prefill), onSaved: { await reload() })
            }
        }
        .sheet(isPresented: $showRecommend) {
            if let place = model.place { RecommendSheet(placeId: place.id, placeName: place.name).presentationDetents([.medium]) }
        }
    }

    private func reload() async { await model.load(session, listId: listId, placeId: placeId) }

    /// 重访预填：自己上次的体验 / 星级 / 同伴 + 当前档位（挂在整家店上）
    private var prefill: VisitPrefill {
        let own = model.logs.first { $0.userId == session.userId }
        return VisitPrefill(sentiment: own?.sentiment, starRating: own?.starRating, companions: own?.companions, tier: model.tierSummary.mine)
    }

    // MARK: - 头图

    @ViewBuilder
    private func hero(_ place: Place) -> some View {
        ZStack(alignment: .bottom) {
            if model.displayPhotos.isEmpty {
                ZStack {
                    LinearGradient(colors: [t.surface2, t.sunken], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: "fork.knife").font(.system(size: 52, weight: .light)).foregroundStyle(t.faint)
                }
                .frame(height: 260)
            } else {
                PhotoCarousel(urls: model.displayPhotos, height: 300)
            }
            LinearGradient(colors: [.clear, t.bg], startPoint: .top, endPoint: .bottom).frame(height: 120)
        }
    }

    // MARK: - 内容

    private func detailContent(_ place: Place) -> some View {
        let uid = session.userId ?? ""
        let meta = [place.cuisine.first, place.priceRange?.rawValue, place.address].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "  ·  ")
        let myReason = place.myReason(for: uid)
        let others = place.reasons.filter { $0.userId != uid && !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }

        return VStack(alignment: .leading, spacing: 0) {
            PillView(text: place.status.label, style: place.status.pillStyle)
            Text(place.name).font(t.display(26)).foregroundStyle(t.ink).padding(.top, 9)
            if !meta.isEmpty { Text(meta).font(t.text(13)).foregroundStyle(t.muted).padding(.top, 4) }

            if let op = model.opening, let open = op.openNow {
                HStack(spacing: 8) {
                    PillView(text: open ? "营业中" : "已打烊", style: open ? .visited : .mute)
                    if let today = op.today { Text(today).font(t.text(12)).foregroundStyle(t.muted) }
                }
                .padding(.top, 9)
            }

            if let rating = place.googleRating {
                HStack(spacing: 9) {
                    Text(String(format: "%.1f", rating)).font(t.display(20)).foregroundStyle(t.ink)
                    StarsView(value: rating)
                    if let n = place.googleRatingCount { Text("\(n) 条评价").font(t.text(12)).foregroundStyle(t.muted) }
                    Spacer()
                    Link(destination: place.googleMapsUri.flatMap { URL(string: $0) } ?? ExternalLinks.mapsURL(name: place.name, address: place.address, lat: place.lat, lng: place.lng)) {
                        Text("Google ›").font(t.text(11, weight: .semibold)).foregroundStyle(t.muted)
                            .padding(.horizontal, 10).padding(.vertical, 3)
                            .overlay(Capsule().stroke(t.border2, lineWidth: t.bw))
                    }
                }
                .padding(.top, 12)
            }

            // 这家几档（viewer 也能评）
            VStack(alignment: .leading, spacing: 8) {
                Text("这家几档？").font(t.text(12, weight: .bold)).foregroundStyle(t.muted)
                HStack {
                    TierQuickPick(placeId: place.id, listId: place.listId, summary: model.tierSummary, showOthers: true,
                                  authors: model.tierAuthors, onChange: { model.setMyTier($0, userId: uid) })
                    Spacer()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .biteCard(padding: 12, radius: t.radii.md)
            .padding(.top, 15)

            if let s = model.signal, s.count > 0 {
                memoryCard(s)
            }

            if let mine = myReason { reasonRow(who: "我的理由", initial: "我", sage: false, text: mine.text) }
            ForEach(Array(others.enumerated()), id: \.offset) { _, r in
                let who = model.reasonAuthors[r.userId] ?? "朋友"
                reasonRow(who: "@\(who)", initial: String(who.prefix(1)).uppercased(), sage: true, text: r.text)
            }

            if let notes = place.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Bite AI 点评", systemImage: "sparkle").font(t.text(12, weight: .bold)).foregroundStyle(t.primarySoftTx)
                    Text(notes).font(t.text(13)).foregroundStyle(t.primarySoftTx).lineSpacing(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(13)
                .background(t.primarySoft.opacity(0.7))
                .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous).stroke(t.primary.opacity(0.2), lineWidth: t.bw))
                .padding(.top, 11)
            }

            if !place.dishes.isEmpty {
                VStack(alignment: .leading, spacing: 9) {
                    Label("招牌 · 网友推荐的菜", systemImage: "fork.knife").font(t.text(12, weight: .bold)).foregroundStyle(t.goldTx)
                    FlowLayout(spacing: 7) {
                        ForEach(place.dishes, id: \.self) { d in
                            Text(d).font(t.text(13, weight: .semibold)).foregroundStyle(t.goldTx)
                                .padding(.horizontal, 11).padding(.vertical, 5)
                                .background(t.goldSoft).clipShape(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous))
                        }
                    }
                }
                .padding(.top, 15)
            }

            HStack(spacing: 6) {
                Text("来源：\(place.source.label)").font(t.text(12)).foregroundStyle(t.muted)
                if let s = place.sourceUrl, let u = URL(string: s) {
                    Link("看原帖 ›", destination: u).font(t.text(12, weight: .semibold)).foregroundStyle(t.link)
                }
            }
            .padding(.top, 15)

            Link(destination: ExternalLinks.menuURL(name: place.name, address: place.address, websiteUri: place.websiteUri)) {
                Label("看这家的菜单", systemImage: "menucard").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bite(.primary, full: true))
            .padding(.top, 16)

            HStack(spacing: 8) {
                if model.canEdit {
                    Button { showVisit = true } label: { Label("我去了", systemImage: "checkmark").frame(maxWidth: .infinity) }
                        .buttonStyle(.bite(.ghost, full: true))
                }
                Link(destination: ExternalLinks.mapsURL(name: place.name, address: place.address, lat: place.lat, lng: place.lng)) {
                    Label("导航", systemImage: "location").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bite(.ghost, full: true))
                if model.canEdit {
                    NavigationLink(value: AppRoute.placeForm(listId: listId, placeId: place.id)) {
                        Label("编辑", systemImage: "pencil").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bite(.ghost, full: true))
                }
            }
            .padding(.top, 9)

            XhsSearchButton(name: place.name).padding(.top, 9)

            CommentThread(placeId: place.id, comments: $model.comments, addedBy: model.addedBy, addedAt: place.createdAt)
                .padding(.top, 22)
        }
        .bitePage()
        .padding(.top, -40)
        .padding(.bottom, 28)
    }

    private func memoryCard(_ s: VisitSignal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("你的回忆", systemImage: "heart").font(t.text(12, weight: .bold)).foregroundStyle(t.sageTx)
            HStack(spacing: 9) {
                if let avg = s.avgStar {
                    Text(String(format: "%.1f", avg)).font(t.display(24)).foregroundStyle(t.sageTx)
                    StarsView(value: avg)
                }
                Text("去过 \(s.count) 次").font(t.text(12)).foregroundStyle(t.muted)
            }
            Text("最近一次 · \(RelDate.label(s.lastVisit)) · \(s.lastSentiment.label)").font(t.text(12)).foregroundStyle(t.sageTx.opacity(0.85))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(t.sageSoft.opacity(0.8))
        .clipShape(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous).stroke(t.sage.opacity(0.22), lineWidth: t.bw))
        .padding(.top, 15)
    }

    private func reasonRow(who: String, initial: String, sage: Bool, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            AvatarView(initial: initial, sage: sage, size: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(who).font(t.text(11.5, weight: .bold)).foregroundStyle(t.ink2)
                Text(text).font(t.text(13)).foregroundStyle(t.ink2).lineSpacing(2)
            }
            Spacer(minLength: 0)
        }
        .biteCard(padding: 12, radius: t.radii.md)
        .padding(.top, 11)
    }
}

/// 「复制店名，去小红书搜」：小红书没有可用的网页搜索路径，只能复制 + 深链唤起 App
struct XhsSearchButton: View {
    @Environment(AppSession.self) private var session
    @Environment(\.openURL) private var openURL
    var name: String

    var body: some View {
        Button {
            UIPasteboard.general.string = name
            session.showToast("已复制「\(name)」，正在打开小红书…", kind: .info)
            if let u = ExternalLinks.xhsSearchURL(name: name) { openURL(u) }
        } label: {
            Label("复制店名，去小红书搜", systemImage: "book").frame(maxWidth: .infinity)
        }
        .buttonStyle(.bite(.ghost, full: true))
    }
}

/// 简单的流式布局（招牌菜 / 标签换行）
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            s.place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
    }
}

/// 横向翻页图集（角标计数 + 圆点）
struct PhotoCarousel: View {
    @Environment(\.bite) private var t
    var urls: [String]
    var height: CGFloat = 220
    @State private var index = 0

    var body: some View {
        ZStack(alignment: .topTrailing) {
            TabView(selection: $index) {
                ForEach(Array(urls.enumerated()), id: \.offset) { i, u in
                    RemoteImage(url: u).tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: urls.count > 1 ? .automatic : .never))
            .frame(height: height)
            if urls.count > 1 {
                Text("\(index + 1) / \(urls.count)")
                    .font(t.text(12, weight: .semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(.black.opacity(0.55)).clipShape(Capsule())
                    .padding(12)
            }
        }
    }
}
