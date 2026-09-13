import SwiftUI
import BiteCore

/// 手动新增 / 编辑店铺（web 的 place-form.tsx + edit 页）。
/// 新增走 API（查重 + 通知共享成员）；编辑直连 Supabase（改名时本地按归一化店名查重）。
struct PlaceFormView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    let listId: String
    let placeId: String?

    @State private var list: BiteList?
    @State private var place: Place?
    @State private var logs: [VisitLog] = []
    @State private var authors: [String: String] = [:]
    @State private var canEdit = true
    @State private var loading = true

    @State private var name = ""
    @State private var address = ""
    @State private var cuisine = ""
    @State private var status: PlaceStatus = .wantToGo
    @State private var price: PlacePrice?
    @State private var occasions = ""
    @State private var tags = ""
    @State private var recommendedBy = ""
    @State private var reason = ""
    @State private var notes = ""
    @State private var photos: [String] = []
    @State private var displayMap: [String: String] = [:]

    @State private var busy = false
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var showRecommend = false

    private var isEdit: Bool { placeId != nil }
    private var vocab: DomainVocab { DomainVocab.vocab(for: list?.category) }

    var body: some View {
        ScrollView {
            if loading {
                LoadingView()
            } else {
                VStack(alignment: .leading, spacing: 22) {
                    if isEdit, !canEdit {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "eye").foregroundStyle(t.muted)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("只读模式").font(t.text(14, weight: .medium)).foregroundStyle(t.ink)
                                Text("你是这个 list 的查看者。要编辑请让 owner 把你升成共同所有者。").font(t.text(13)).foregroundStyle(t.muted)
                            }
                        }
                        .biteCard(padding: 12, radius: t.radii.md, background: t.surface2)
                    }
                    group("基本信息") {
                        field("店名", required: true) { TextField("", text: $name).biteField() }
                        field("地址", required: true) { TextField("", text: $address).biteField() }
                        field(vocab.typeLabel, required: true, help: "多个用逗号 / 空格分隔") {
                            TextField("川菜、火锅", text: $cuisine).biteField()
                        }
                        HStack(spacing: 12) {
                            field("状态") {
                                Picker("", selection: $status) {
                                    ForEach(PlaceStatus.displayOrder, id: \.self) { Text($0.formLabel).tag($0) }
                                }
                                .pickerStyle(.menu).biteField()
                            }
                            field(vocab.priceLabel) {
                                Picker("", selection: $price) {
                                    Text("未填").tag(PlacePrice?.none)
                                    ForEach(PlacePrice.allCases, id: \.self) { Text($0.rangeLabel).tag(PlacePrice?.some($0)) }
                                }
                                .pickerStyle(.menu).biteField()
                            }
                        }
                    }
                    group("细节") {
                        field("适合场合") { TextField("约会、聚会、招待长辈", text: $occasions).biteField() }
                        field("自定义标签") { TextField("排队长、有露台、可带宠物", text: $tags).biteField() }
                        field("推荐来源") { TextField("朋友、XHS 博主、自己…", text: $recommendedBy).biteField() }
                        field("图片", help: "第一张作为封面") {
                            if canEdit { PhotoStrip(photos: $photos, displayMap: $displayMap) }
                            else if !photos.isEmpty { PhotoCarousel(urls: photos.map { displayMap[$0] ?? $0 }, height: 180).clipShape(RoundedRectangle(cornerRadius: t.radii.md)) }
                        }
                    }
                    group("理由") {
                        field("想去理由 / 备注", help: "为啥想去？以后 AI 推荐会引用这里") {
                            TextField("", text: $reason, axis: .vertical).lineLimit(2...6).biteField()
                        }
                        field("AI 综合判断 / 备注", help: "未来决策 agent 会读它做推荐") {
                            TextField("客观信号：评论区分歧、排队、营业时间、性价比、缺失信息…", text: $notes, axis: .vertical).lineLimit(3...8).biteField()
                        }
                    }
                    if let error { ErrorBanner(message: error) }
                    if canEdit {
                        Button(busy ? "保存中…" : (isEdit ? "更新" : "保存")) { Task { await save() } }
                            .buttonStyle(.bite(.primary, full: true))
                            .disabled(busy)
                    }
                    if isEdit, let place {
                        Divider().padding(.top, 8)
                        VisitHistoryView(place: place, logs: logs, canEdit: canEdit, authors: authors, displayMap: displayMap, reload: loadVisits)
                        if canEdit {
                            Divider()
                            HStack {
                                Text("删除后店铺与造访记录无法恢复").font(t.text(13)).foregroundStyle(t.muted)
                                Spacer()
                                Button("删除店铺") { confirmDelete = true }.buttonStyle(.bite(.danger, compact: true))
                            }
                        }
                    }
                }
                .bitePage()
                .padding(.vertical, 16)
            }
        }
        .background(t.bg)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(isEdit ? (canEdit ? "编辑店铺" : (place?.name ?? "")) : "新增店铺")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isEdit, let place {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showRecommend = true } label: { Image(systemName: "paperplane") }
                        .sheet(isPresented: $showRecommend) { RecommendSheet(placeId: place.id, placeName: place.name).presentationDetents([.medium]) }
                }
            }
        }
        .task { await load() }
        .confirmationDialog("确认删除「\(name)」？此操作无法撤销。", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("删除店铺", role: .destructive) { Task { await deletePlace() } }
        }
    }

    private func group<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(t.display(18)).foregroundStyle(t.ink).padding(.bottom, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .bottom) { Rectangle().fill(t.border).frame(height: 1) }
            content()
        }
    }

    private func field<C: View>(_ label: String, required: Bool = false, help: String? = nil, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 3) {
                Text(label).font(t.text(14, weight: .medium)).foregroundStyle(t.ink2)
                if required, canEdit { Text("*").foregroundStyle(t.primary) }
            }
            content().disabled(!canEdit)
            if let help { Text(help).font(t.text(12)).foregroundStyle(t.muted) }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        guard let uid = session.userId else { return }
        do {
            list = try await session.repos.lists.fetch(id: listId)
            let members = try await session.repos.lists.members(listId: listId)
            let isOwner = list?.ownerId == uid
            canEdit = isOwner || members.first { $0.userId == uid }?.role == .coOwner
            if let placeId {
                guard let p = try await session.repos.places.fetch(id: placeId) else { error = "找不到这家店"; return }
                place = p
                name = p.name; address = p.address; cuisine = p.cuisine.joined(separator: ", ")
                status = p.status; price = p.priceRange
                occasions = p.occasions.joined(separator: ", "); tags = p.tags.joined(separator: ", ")
                recommendedBy = p.recommendedBy ?? ""
                reason = p.myReason(for: uid)?.text ?? ""
                notes = p.notes ?? ""
                photos = p.photoUrls
                await loadVisits()
                let map = await session.photos.signedMap(for: photos + logs.flatMap(\.photos))
                displayMap = map
            }
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }

    private func loadVisits() async {
        guard let placeId else { return }
        logs = (try? await session.repos.visits.fetch(placeId: placeId)) ?? []
        let others = Set(logs.map(\.userId).filter { $0 != session.userId })
        if !others.isEmpty, let profiles = try? await session.repos.profiles.fetch(ids: Array(others)) {
            authors = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.displayName) })
        }
        let map = await session.photos.signedMap(for: logs.flatMap(\.photos).filter { displayMap[$0] == nil })
        displayMap.merge(map) { _, b in b }
    }

    private func save() async {
        guard let uid = session.userId else { return }
        let nm = name.trimmingCharacters(in: .whitespaces)
        let addr = address.trimmingCharacters(in: .whitespaces)
        let cuisines = ParseTags.parse(cuisine)
        if nm.isEmpty { error = "请填写店名"; return }
        if addr.isEmpty { error = "请填写地址"; return }
        if cuisines.isEmpty { error = "请填写至少一个类型标签（吃=菜系 / 喝=品类 / 玩=类型）"; return }
        busy = true; error = nil
        defer { busy = false }
        let normalized = photos.map { PhotoURL.normalize($0, supabaseURL: Env.supabaseURLString) }
        do {
            if let placeId, let current = place {
                // 改名才查重：库里可能本来就有两条归一化同名的历史行，不能互相锁死
                if !NameKey.same(current.name, nm) {
                    let rows = try await session.repos.places.nameRows(listId: listId)
                    if let dup = rows.first(where: { $0.id != placeId && NameKey.same($0.name, nm) }) {
                        error = "这个清单里已经有「\(dup.name)」了，换个名字。"; return
                    }
                }
                try await session.repos.places.update(id: placeId, fields: [
                    "name": .string(nm), "address": .string(addr), "cuisine": .strings(cuisines),
                    "price_range": .from(price?.rawValue), "status": .string(status.rawValue),
                    "occasions": .strings(ParseTags.parse(occasions)), "tags": .strings(ParseTags.parse(tags)),
                    "recommended_by": .from(recommendedBy.trimmingCharacters(in: .whitespaces).ifEmpty("").isEmpty ? nil : recommendedBy.trimmingCharacters(in: .whitespaces)),
                    "notes": .from(notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "photo_urls": .strings(normalized),
                ])
                try await session.repos.places.syncOwnReason(placeId: placeId, userId: uid, text: reason)
                session.showToast("已更新")
                session.router.listsPath.removeLast()
            } else {
                _ = try await session.api.createPlace(CreatePlaceRequest(
                    listId: listId, name: nm, address: addr, cuisine: cuisines, priceRange: price?.rawValue, status: status.rawValue,
                    occasions: ParseTags.parse(occasions), tags: ParseTags.parse(tags),
                    recommendedBy: recommendedBy.trimmingCharacters(in: .whitespaces).isEmpty ? nil : recommendedBy,
                    reason: reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : reason,
                    notes: notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes,
                    photoUrls: normalized))
                session.showToast("已添加店铺")
                session.router.listsPath.removeLast()
            }
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }

    private func deletePlace() async {
        guard let placeId else { return }
        do {
            try await session.repos.places.delete(id: placeId)
            session.showToast("已删除")
            // 从编辑页退到清单（可能经过详情页）
            session.router.listsPath = session.router.listsPath.filter {
                if case .list = $0 { return true }
                return false
            }
        } catch { session.showError(error) }
    }
}

/// 推荐给朋友（走 API：按邮箱找人 + 邮件 + 推送）
struct RecommendSheet: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bite) private var t
    var placeId: String
    var placeName: String
    @State private var email = ""
    @State private var message = ""
    @State private var busy = false
    @State private var error: String?
    @State private var sentTo: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("推荐给朋友").font(t.display(20)).foregroundStyle(t.ink)
            Text("把「\(placeName)」推荐给一个 Bite 用户").font(t.text(13)).foregroundStyle(t.muted)
            if let sentTo {
                SuccessBanner(message: "已发送给 \(sentTo)")
            } else {
                Text("朋友的邮箱").font(t.text(12, weight: .semibold)).foregroundStyle(t.muted)
                TextField("friend@example.com", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().biteField()
                Text("一句话理由（可选）").font(t.text(12, weight: .semibold)).foregroundStyle(t.muted)
                TextField("你肯定喜欢这家的牛肉面", text: $message, axis: .vertical).lineLimit(2...4).biteField()
                if let error { ErrorBanner(message: error) }
                HStack {
                    Spacer()
                    Button("取消") { dismiss() }.buttonStyle(.bite(.ghost))
                    Button(busy ? "发送中…" : "发送") { Task { await send() } }.buttonStyle(.bite(.primary))
                        .disabled(busy || email.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            Spacer()
        }
        .padding(20)
        .background(t.bg)
    }

    private func send() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let r = try await session.api.sendRecommendation(toEmail: email.trimmingCharacters(in: .whitespaces), placeId: placeId, message: String(message.prefix(200)))
            sentTo = r.recipientEmail
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            dismiss()
        } catch { self.error = ErrorText.friendly(error) }
    }
}
