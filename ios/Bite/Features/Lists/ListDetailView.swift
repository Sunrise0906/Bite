import SwiftUI
import BiteCore

struct ListDetailView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    let listId: String
    @State private var model = ListDetailModel()
    @State private var renaming = false
    @State private var showInvite = false
    @State private var confirmDelete = false
    @State private var confirmLeave = false

    var body: some View {
        ScrollView {
            if let list = model.list {
                VStack(alignment: .leading, spacing: 0) {
                    header(list)
                    if model.canEdit {
                        QuickAddBar(targetListId: list.id).padding(.vertical, 8)
                    }
                    actionRow(list)
                    if !model.members.isEmpty {
                        MembersPanel(listId: list.id, members: model.members, canManage: model.isOwner, reload: reload)
                            .padding(.bottom, 16)
                    }
                    if !model.invites.isEmpty {
                        ActiveInvitesPanel(invites: model.invites, reload: reload).padding(.bottom, 16)
                    }
                    if model.places.isEmpty {
                        EmptyStateView(title: "这个清单还没有店",
                                       subtitle: model.canEdit ? "在上面粘个小红书链接、写几句话，或直接搜店名" : "等所有者添加店铺")
                    } else {
                        PlacesListView(listId: list.id, model: model)
                    }
                    dangerZone(list)
                }
                .bitePage()
                .padding(.bottom, 28)
            } else if model.notFound {
                EmptyStateView(title: "找不到这个清单", subtitle: "可能已被删除，或你没有访问权限")
            } else if let e = model.error {
                ErrorBanner(message: e).padding()
            } else {
                LoadingView()
            }
        }
        .background(t.bg)
        .navigationTitle(model.list?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(t.bg, for: .navigationBar)
        .refreshable { await reload() }
        .task(id: listId) { await model.load(session, listId: listId) }
        .onChange(of: session.router.quickAddSeed) { old, new in
            if old != nil, new == nil { Task { await reload() } }
        }
        .sheet(isPresented: $renaming) {
            if let list = model.list {
                RenameSheet(title: "重命名清单", initial: list.name) { name in
                    try await session.repos.lists.rename(id: list.id, name: name)
                    session.showToast("已重命名")
                    await reload()
                }
                .presentationDetents([.height(220)])
            }
        }
        .sheet(isPresented: $showInvite) {
            if let list = model.list { InviteSheet(listId: list.id, onCreated: reload).presentationDetents([.medium, .large]) }
        }
        .confirmationDialog("确认删除清单？这会同时删除其中所有的店铺记录与造访日志，且无法撤销。",
                            isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("删除清单", role: .destructive) { Task { await deleteList() } }
        }
        .confirmationDialog("离开这个清单？你将无法再访问。", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("离开", role: .destructive) { Task { await leaveList() } }
        }
    }

    private func reload() async { await model.load(session, listId: listId) }

    private func header(_ list: BiteList) -> some View {
        let want = model.places.filter { $0.status == .wantToGo }.count
        let visited = model.places.filter { $0.status == .visited }.count
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                if model.canEdit {
                    Button { renaming = true } label: {
                        HStack(spacing: 8) {
                            Text(list.name).font(t.display(25)).foregroundStyle(t.ink).multilineTextAlignment(.leading)
                            Image(systemName: "pencil").font(.system(size: 14)).foregroundStyle(t.faint)
                        }
                    }
                    .buttonStyle(.plain)
                } else {
                    Text(list.name).font(t.display(25)).foregroundStyle(t.ink)
                }
                Spacer()
                if model.canEdit {
                    Button("+ 邀请") { showInvite = true }.buttonStyle(.bite(.ghost, compact: true))
                }
            }
            HStack(spacing: 8) {
                Text("\(model.places.count) 家店").font(t.text(13)).foregroundStyle(t.muted)
                if want > 0 { Text("· 想去 \(want)").font(t.text(13)).foregroundStyle(t.muted) }
                if visited > 0 { Text("· 去过 \(visited)").font(t.text(13)).foregroundStyle(t.muted) }
                if !model.isOwner {
                    PillView(text: (model.memberRole == .coOwner ? "共享 · 可编辑" : "共享 · 只读") + (model.ownerName.map { " · @\($0)" } ?? ""), style: .visited)
                }
                if list.category != .food { PillView(text: list.category.label, style: .mute) }
            }
        }
        .padding(.top, 12).padding(.bottom, 6)
    }

    private func actionRow(_ list: BiteList) -> some View {
        let want = model.places.filter { $0.status == .wantToGo }.count
        return HStack(spacing: 9) {
            if model.canEdit {
                NavigationLink(value: AppRoute.placeForm(listId: list.id, placeId: nil)) {
                    Text("手动填写").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bite(.ghost, full: true))
            }
            if !model.places.isEmpty {
                Button {
                    session.router.tab = .chat
                    session.router.chatPath = [.conversation(id: nil, scopeListId: list.id)]
                } label: {
                    Label("帮我从这挑", systemImage: "sparkles").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bite(.primary, full: true))
            }
            if want >= 2 {
                NavigationLink(value: AppRoute.pick(listId: list.id)) {
                    Label("一起选", systemImage: "heart").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bite(.sage, full: true))
            }
        }
        .padding(.top, 8).padding(.bottom, 18)
    }

    private func dangerZone(_ list: BiteList) -> some View {
        HStack {
            Text(model.isOwner ? "危险操作" : "不再关注").font(t.text(13)).foregroundStyle(t.muted)
            Spacer()
            if model.isOwner {
                Button("删除 list") { confirmDelete = true }.buttonStyle(.bite(.danger, compact: true))
            } else {
                Button("离开 list") { confirmLeave = true }.buttonStyle(.bite(.danger, compact: true))
            }
        }
        .padding(.top, 36)
        .overlay(alignment: .top) { Rectangle().fill(t.border).frame(height: 1).padding(.top, 18) }
    }

    private func deleteList() async {
        do {
            try await session.repos.lists.delete(id: listId)
            session.showToast("list 已删除")
            session.router.listsPath.removeAll()
        } catch { session.showError(error) }
    }

    private func leaveList() async {
        guard let uid = session.userId else { return }
        do {
            try await session.repos.lists.leave(listId: listId, userId: uid)
            session.showToast("已离开清单")
            session.router.listsPath.removeAll()
        } catch { session.showError(error) }
    }
}

// MARK: - 店铺列表（搜索 / 筛选 / 按状态分组）

struct PlacesListView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    let listId: String
    @Bindable var model: ListDetailModel

    @State private var search = ""
    @State private var statusFilter: PlaceStatus?
    @State private var cuisineSel = Set<String>()
    @State private var priceSel = Set<PlacePrice>()
    @State private var manage = false
    @State private var confirmDelete: Place?

    private var statusCounts: [PlaceStatus: Int] {
        var c: [PlaceStatus: Int] = [:]
        for p in model.places { c[p.status, default: 0] += 1 }
        return c
    }

    private var cuisines: [(String, Int)] {
        var c: [String: Int] = [:]
        for p in model.places { for x in p.cuisine { c[x, default: 0] += 1 } }
        return c.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }.prefix(8).map { ($0.key, $0.value) }
    }

    private var prices: [(PlacePrice, Int)] {
        var c: [PlacePrice: Int] = [:]
        for p in model.places { if let pr = p.priceRange { c[pr, default: 0] += 1 } }
        return PlacePrice.allCases.compactMap { p in c[p].map { n in (p, n) } }
    }

    private var hasFilters: Bool { !search.trimmingCharacters(in: .whitespaces).isEmpty || statusFilter != nil || !cuisineSel.isEmpty || !priceSel.isEmpty }

    private var filtered: [Place] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return model.places.filter { p in
            if let s = statusFilter, p.status != s { return false }
            if !cuisineSel.isEmpty, !p.cuisine.contains(where: { cuisineSel.contains($0) }) { return false }
            if !priceSel.isEmpty { guard let pr = p.priceRange, priceSel.contains(pr) else { return false } }
            if !q.isEmpty {
                let hay = ([p.name, p.address, p.notes ?? ""] + p.cuisine + p.tags + p.reasons.map(\.text)).joined(separator: " ").lowercased()
                if !hay.contains(q) { return false }
            }
            return true
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if model.canEdit {
                HStack {
                    Text(manage ? "管理中：可编辑或删除店铺" : "\(model.places.count) 家店").font(t.text(12.5)).foregroundStyle(t.muted)
                    Spacer()
                    Button(manage ? "完成" : "管理") { manage.toggle() }
                        .font(t.text(12.5, weight: .semibold)).foregroundStyle(manage ? t.ink : t.link)
                }
                .padding(.bottom, 10)
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(t.faint)
                TextField("搜店名 / 菜系 / 备注…", text: $search)
            }
            .biteField()
            .padding(.bottom, 12)

            FilterRow {
                FilterChip(text: "全部 \(model.places.count)", on: statusFilter == nil) { statusFilter = nil }
                ForEach(PlaceStatus.displayOrder.filter { (statusCounts[$0] ?? 0) > 0 }, id: \.self) { s in
                    FilterChip(text: "\(s.label) \(statusCounts[s] ?? 0)", on: statusFilter == s) { statusFilter = statusFilter == s ? nil : s }
                }
            }
            .padding(.bottom, 8)

            if !cuisines.isEmpty {
                FilterRow {
                    ForEach(cuisines, id: \.0) { c, n in
                        FilterChip(text: "\(c) \(n)", on: cuisineSel.contains(c)) {
                            if cuisineSel.contains(c) { cuisineSel.remove(c) } else { cuisineSel.insert(c) }
                        }
                    }
                }
                .padding(.bottom, 8)
            }

            if !prices.isEmpty || hasFilters {
                FilterRow {
                    ForEach(prices, id: \.0) { p, n in
                        FilterChip(text: "\(p.rawValue) \(n)", on: priceSel.contains(p)) {
                            if priceSel.contains(p) { priceSel.remove(p) } else { priceSel.insert(p) }
                        }
                    }
                    if hasFilters {
                        FilterChip(text: "清除筛选", on: false) {
                            search = ""; statusFilter = nil; cuisineSel = []; priceSel = []
                        }
                    }
                }
                .padding(.bottom, 16)
            }

            if filtered.isEmpty {
                EmptyStateView(title: "没有匹配的店", subtitle: "试试换个关键词或清掉筛选")
            } else {
                ForEach(PlaceStatus.displayOrder, id: \.self) { status in
                    let items = filtered.filter { $0.status == status }
                    if !items.isEmpty {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(status.label).font(t.display(16)).foregroundStyle(t.ink)
                            Text("\(items.count)").font(t.text(14)).foregroundStyle(t.faint)
                        }
                        .padding(.top, 8).padding(.bottom, 11)
                        VStack(spacing: 10) {
                            ForEach(items) { p in
                                PlaceCardView(place: p, listId: listId, cover: model.covers[p.id],
                                              canEdit: model.canEdit, manage: manage,
                                              visit: model.visitsByPlace[p.id],
                                              tierRows: model.tiersByPlace[p.id] ?? [],
                                              reasonAuthors: model.reasonAuthors,
                                              onStatus: { s in model.setStatus(placeId: p.id, status: s) },
                                              onTier: { tier in if let uid = session.userId { model.setMyTier(placeId: p.id, tier: tier, userId: uid) } },
                                              onDelete: { confirmDelete = p })
                            }
                        }
                        .padding(.bottom, 12)
                    }
                }
            }
        }
        .confirmationDialog("确认删除「\(confirmDelete?.name ?? "")」？这家店的造访记录也会一并删除，且无法撤销。",
                            isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
                            titleVisibility: .visible) {
            Button("删除", role: .destructive) {
                if let p = confirmDelete { Task { await delete(p) } }
            }
        }
    }

    private func delete(_ p: Place) async {
        do {
            try await session.repos.places.delete(id: p.id)
            model.remove(placeId: p.id)
            session.showToast("已删除")
        } catch { session.showError(error) }
    }
}
