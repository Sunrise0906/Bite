import SwiftUI
import PhotosUI
import BiteCore

/// 智能添加的 sheet：输入 → 确认 / 合集勾选
struct QuickAddFlowView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bite) private var t
    let seed: QuickAddSeed
    @State private var model = QuickAddModel()
    @State private var location = LocationService()

    var body: some View {
        NavigationStack {
            Group {
                switch model.step {
                case .input: QuickAddInputView(model: model)
                case .confirm: QuickAddConfirmView(model: model, onDone: finish)
                case .multi: QuickAddMultiView(model: model, onDone: finish)
                }
            }
            .background(t.bg)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if model.step == .input { Button("取消") { dismiss() } }
                    else { Button("返回") { model.step = .input; model.saveError = nil } }
                }
            }
        }
        .interactiveDismissDisabled(model.extracting || model.saving)
        .task {
            model.targetListId = seed.targetListId
            if let text = seed.text { model.text = text }
            await model.loadLists(session)
            if let img = seed.imageData {
                await model.extract(session, image: img)
            } else if let text = seed.text, case .freeText = QuickAddDetect.detect(text) {
                // 从分享扩展带链接进来：直接开抓
                await model.extract(session)
            }
            model.origin = await location.requestOnce(timeout: 5)
        }
    }

    private var title: String {
        switch model.step {
        case .input: return "添加店铺"
        case .confirm: return "确认店铺信息"
        case .multi: return "合集帖 · 多店选择"
        }
    }

    private func finish() {
        let listId = model.selectedListId
        dismiss()
        if !listId.isEmpty {
            session.router.tab = .lists
            session.router.listsPath = [.list(listId)]
        }
    }
}

// MARK: - 输入

struct QuickAddInputView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @Bindable var model: QuickAddModel
    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var speech = SpeechRecognizer()
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(t.faint).padding(.top, 3)
                        TextField("粘贴小红书链接、写几句话、或搜店名…", text: $model.text, axis: .vertical)
                            .lineLimit(1...8).font(t.text(16)).focused($focused)
                        if speech.isAvailable {
                            Button { speech.toggle { model.text = model.text.isEmpty ? $0 : model.text + " " + $0 } } label: {
                                Image(systemName: speech.listening ? "mic.fill" : "mic").foregroundStyle(speech.listening ? t.primary : t.muted)
                            }
                        }
                        Button { showCamera = true } label: { Image(systemName: "camera").foregroundStyle(t.muted) }
                    }
                    .padding(14)
                    if case .freeText(let hasXhs) = model.detected {
                        Divider().overlay(t.border)
                        HStack {
                            Label(hasXhs ? "小红书链接 · 抓取 + AI 解析" : "长文本 · 用 AI 解析", systemImage: hasXhs ? "link" : "sparkles")
                                .font(t.text(12)).foregroundStyle(t.muted).lineLimit(1)
                            Spacer()
                            Button(model.extracting ? (hasXhs ? "抓取中…" : "解析中…") : (hasXhs ? "抓取并解析" : "用 AI 解析")) {
                                focused = false
                                Task { await model.extract(session) }
                            }
                            .buttonStyle(.bite(.primary, compact: true))
                            .disabled(model.extracting)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 8)
                    }
                }
                .background(t.surface)
                .clipShape(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous).stroke(focused ? t.primary : t.border2, lineWidth: t.bw))

                HStack(spacing: 8) {
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Label("相册识店", systemImage: "photo").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bite(.ghost, full: true))
                    Button { showCamera = true } label: { Label("拍照识店", systemImage: "camera").frame(maxWidth: .infinity) }
                        .buttonStyle(.bite(.ghost, full: true))
                }
                Text("菜单 / 店面 / 帖子截图都认得。粘小红书分享链接会自动抓取正文和图片。")
                    .font(t.text(12)).foregroundStyle(t.faint)

                if model.extracting {
                    HStack(spacing: 8) { ProgressView().tint(t.primary); Text("识别中…").font(t.text(13)).foregroundStyle(t.muted) }
                        .padding(.top, 6)
                }
                if let e = model.extractError { ErrorBanner(message: e) }

                if case .placeName = model.detected { suggestions }

                if !model.listsLoaded {
                    EmptyView()
                } else if model.writableLists.isEmpty {
                    NoWritableListView(model: model)
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear { focused = model.text.isEmpty }
        .task(id: model.text) {
            guard case .placeName = model.detected else { model.suggestions = []; return }
            try? await Task.sleep(nanoseconds: 250_000_000)
            await model.search(session)
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            pickerItem = nil
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data),
                   let jpeg = PhotoService.jpegData(from: img) {
                    await model.extract(session, image: jpeg)
                }
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { img in
                Task { if let jpeg = PhotoService.jpegData(from: img) { await model.extract(session, image: jpeg) } }
            }
            .ignoresSafeArea()
        }
    }

    @ViewBuilder
    private var suggestions: some View {
        if model.searching {
            Text("搜索中…").font(t.text(12)).foregroundStyle(t.muted).padding(.horizontal, 8)
        } else if let e = model.searchError {
            Text(e).font(t.text(12)).foregroundStyle(t.danger).padding(.horizontal, 8)
        } else if model.suggestions.isEmpty, model.text.trimmingCharacters(in: .whitespaces).count >= 2 {
            Text("没找到附近的店").font(t.text(12)).foregroundStyle(t.muted).padding(.horizontal, 8)
        } else {
            VStack(spacing: 0) {
                ForEach(model.suggestions) { s in
                    Button { Task { await model.pickSuggestion(s, session: session) } } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "mappin").foregroundStyle(t.primary)
                                .frame(width: 32, height: 32).background(t.primarySoft).clipShape(Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(s.mainText).font(t.text(14, weight: .medium)).foregroundStyle(t.ink).lineLimit(1)
                                    Spacer()
                                    if let d = s.distanceMeters { Text(Distance.formatMeters(d)).font(t.text(11, weight: .semibold)).foregroundStyle(t.primary) }
                                }
                                Text(s.secondaryText).font(t.text(12)).foregroundStyle(t.muted).lineLimit(1)
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 11)
                    }
                    .buttonStyle(.plain)
                    Divider().overlay(t.border)
                }
            }
            .background(t.surface)
            .clipShape(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous).stroke(t.border, lineWidth: t.bw))
            .biteShadow(.card)
        }
    }
}

/// 没有可写清单时原地建一个（不然 AI 抽取的草稿就白跑了）
struct NoWritableListView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @Bindable var model: QuickAddModel
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("你还没有可写的 list — 先建一个，然后就能继续了。").font(t.text(14)).foregroundStyle(t.ink2)
            HStack(spacing: 8) {
                TextField("比如「Irvine 想吃的」", text: $name).biteField()
                Button(busy ? "建中…" : "建 list") { Task { await create() } }.buttonStyle(.bite(.primary)).disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if let error { ErrorBanner(message: error) }
        }
        .biteCard(padding: 14)
    }

    private func create() async {
        guard let uid = session.userId else { return }
        busy = true; error = nil
        defer { busy = false }
        do {
            let id = try await session.repos.lists.create(name: name.trimmingCharacters(in: .whitespaces), category: .food, ownerId: uid)
            model.listsLoaded = false
            model.selectedListId = id
            await model.loadLists(session)
        } catch { self.error = ErrorText.friendly(error) }
    }
}

// MARK: - 单店确认

struct QuickAddConfirmView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @Bindable var model: QuickAddModel
    var onDone: () -> Void

    private var vocab: DomainVocab {
        DomainVocab.vocab(for: model.writableLists.first { $0.id == model.selectedListId }?.category)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                preview
                if let c = model.form.confidence { confidence(c) }
                sourceBanner

                VStack(alignment: .leading, spacing: 6) {
                    Text("添加到 list *").font(t.text(14, weight: .medium)).foregroundStyle(t.ink2)
                    ListPicker(lists: model.writableLists, selected: $model.selectedListId, dupListIds: model.dupListIds)
                    if model.isDuplicateInSelectedList { dupNotice }
                }

                Text("基本信息").font(t.display(16)).foregroundStyle(t.ink)
                field("店名 *") {
                    TextField("", text: $model.form.name).biteField()
                        .onChange(of: model.form.name) { _, _ in Task { try? await Task.sleep(nanoseconds: 400_000_000); await model.checkDup(session) } }
                }
                field("地址 *") { TextField("", text: $model.form.address).biteField() }
                field("\(vocab.typeLabel) *", help: "多个用逗号 / 空格分隔") { TextField("川菜、火锅", text: $model.form.cuisine).biteField() }
                HStack(spacing: 12) {
                    field("状态") {
                        Picker("", selection: $model.form.status) { ForEach(PlaceStatus.displayOrder, id: \.self) { Text($0.formLabel).tag($0) } }
                            .pickerStyle(.menu).biteField()
                    }
                    field(vocab.priceLabel) {
                        Picker("", selection: $model.form.price) {
                            Text("未填").tag(PlacePrice?.none)
                            ForEach(PlacePrice.allCases, id: \.self) { Text($0.rangeLabel).tag(PlacePrice?.some($0)) }
                        }
                        .pickerStyle(.menu).biteField()
                    }
                }
                Text("偏好与备注").font(t.display(16)).foregroundStyle(t.ink)
                field("适合场合") { TextField("约会、聚会、招待长辈", text: $model.form.occasions).biteField() }
                field("标签") { TextField("排队长、有露台、可带宠物", text: $model.form.tags).biteField() }
                field("推荐来源") { TextField("朋友、XHS 博主、自己…", text: $model.form.recommendedBy).biteField() }
                field("想去理由", help: "为啥想去？以后 AI 推荐会引用这里") { TextField("", text: $model.form.reason, axis: .vertical).lineLimit(2...5).biteField() }
                field("AI 综合判断 / 备注", help: "会持久保存到这家店，未来决策 agent 会读它做推荐") {
                    TextField("", text: $model.form.notes, axis: .vertical).lineLimit(3...8).biteField()
                }

                if let e = model.saveError { ErrorBanner(message: e) }

                Button(model.saving ? "保存中…" : model.checkingDup ? "检查是否已存在…" : model.isDuplicateInSelectedList ? "覆盖更新" : "确认添加") {
                    Task { if await model.saveSingle(session) { onDone() } }
                }
                .buttonStyle(.bite(.primary, full: true))
                .disabled(model.saving || model.checkingDup || model.selectedListId.isEmpty)
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !model.form.photoUrls.isEmpty {
                PhotoCarousel(urls: model.displayPhotos.isEmpty ? model.form.photoUrls : model.displayPhotos, height: 180)
                    .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
            }
            Text(model.form.name).font(t.display(20)).foregroundStyle(t.ink)
            Text([model.form.address, model.form.cuisine, model.form.price?.rawValue].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "  ·  "))
                .font(t.text(12.5)).foregroundStyle(t.muted)
            if !model.form.dishes.isEmpty || !model.form.tags.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(model.form.dishes, id: \.self) { TagView(text: "🍜 \($0)", primary: true) }
                    ForEach(ParseTags.parse(model.form.tags), id: \.self) { TagView(text: $0) }
                }
            }
            if !model.form.notes.isEmpty {
                Text("🤖 \(model.form.notes)").font(t.text(12)).foregroundStyle(t.primarySoftTx)
                    .padding(9).frame(maxWidth: .infinity, alignment: .leading)
                    .background(t.primarySoft).clipShape(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous))
            }
        }
        .biteCard(padding: 12, shadow: .card)
    }

    private func confidence(_ c: String) -> some View {
        let on = c == "high" ? 3 : c == "medium" ? 2 : 1
        return HStack {
            Text("AI 提取信心").font(t.text(12)).foregroundStyle(t.muted)
            Text(c == "high" ? "高" : c == "medium" ? "中 · 请检查字段" : "低 · 请检查字段")
                .font(t.text(12, weight: .bold)).foregroundStyle(c == "high" ? t.ink : t.primaryDeep)
            Spacer()
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2).fill(i < on ? t.primary : t.surface2).frame(width: 18, height: 6)
                }
            }
        }
    }

    private var sourceBanner: some View {
        let s = model.form.source
        return HStack(spacing: 8) {
            Image(systemName: s == "google_places" ? "globe" : s == "xhs" ? "book" : "sparkles")
            Text(s == "google_places" ? "来自 Google Places · 已自动填入店名 / 地址 / 类型推断"
                 : s == "xhs" ? "来自小红书链接 · 已抓取并由 AI 解析" : "来自 AI 解析 · 你可以修改任何字段")
            if s == "xhs", let u = model.form.sourceUrl, let url = URL(string: u) { Link("查看原帖", destination: url).underline() }
        }
        .font(t.text(12)).foregroundStyle(t.muted)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(t.surface2).clipShape(RoundedRectangle(cornerRadius: t.radii.sm, style: .continuous))
    }

    private var dupNotice: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("「\(model.form.name.trimmingCharacters(in: .whitespaces))」已在这个清单里。提交会合并：", systemImage: "exclamationmark.triangle")
                .font(t.text(13, weight: .medium))
            Text("• 想去理由替换你自己那条，朋友的保留；AI 备注库里已有就保留\n• 图片 / 菜系 / 标签 / 场合合并去重\n• 地址 / 价位 / 推荐来源这次填了才覆盖；「想去」不会把已去过打回来")
                .font(t.text(12))
        }
        .foregroundStyle(t.primarySoftTx)
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(t.primarySoft.opacity(0.5)).clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
    }

    private func field<C: View>(_ label: String, help: String? = nil, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(t.text(14, weight: .medium)).foregroundStyle(t.ink2)
            content()
            if let help { Text(help).font(t.text(12)).foregroundStyle(t.muted) }
        }
    }
}

struct ListPicker: View {
    @Environment(\.bite) private var t
    var lists: [QuickAddModel.WritableList]
    @Binding var selected: String
    var dupListIds: Set<String> = []
    var dupCounts: [String: Int] = [:]

    var body: some View {
        Picker("", selection: $selected) {
            ForEach(lists) { l in
                Text(l.name + (l.isOwner ? "" : "（共享）") + (dupListIds.contains(l.id) ? "  · 已存在同名店" : "") + (dupCounts[l.id].map { "  · \($0) 家已存在" } ?? ""))
                    .tag(l.id)
            }
        }
        .pickerStyle(.menu)
        .biteField()
    }
}

// MARK: - 合集帖多店勾选

struct QuickAddMultiView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @Bindable var model: QuickAddModel
    var onDone: () -> Void

    var body: some View {
        ScrollView {
            if let d = model.draft {
                let dupNames = model.dupNamesByList[model.selectedListId] ?? []
                let dupSelected = model.selected.filter { d.places.indices.contains($0) && dupNames.contains(d.places[$0].name) }.count
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                        Text("AI 识别为合集帖，共 \(d.places.count) 家店。勾选要添加的：")
                        if let u = d.sourceUrl, let url = URL(string: u) { Link("查看原帖", destination: url).underline() }
                    }
                    .font(t.text(12)).foregroundStyle(t.muted)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(t.surface2).clipShape(RoundedRectangle(cornerRadius: t.radii.sm, style: .continuous))

                    if let w = d.scrapeWarning { ErrorBanner(message: w) }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("统一添加到 list *").font(t.text(14, weight: .medium)).foregroundStyle(t.ink2)
                        ListPicker(lists: model.writableLists, selected: $model.selectedListId,
                                   dupCounts: model.dupNamesByList.mapValues(\.count))
                    }

                    HStack {
                        Text("已勾选 \(model.selected.count) / \(d.places.count)").font(t.text(12)).foregroundStyle(t.muted)
                        Spacer()
                        Button("全选") { model.selected = Set(d.places.indices) }.font(t.text(12, weight: .medium))
                        Button("全不选") { model.selected = [] }.font(t.text(12, weight: .medium))
                    }
                    .foregroundStyle(t.muted)

                    ForEach(Array(d.places.enumerated()), id: \.offset) { i, p in
                        let checked = model.selected.contains(i)
                        Button {
                            if checked { model.selected.remove(i) } else { model.selected.insert(i) }
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: checked ? "checkmark.square.fill" : "square").font(.system(size: 20))
                                    .foregroundStyle(checked ? t.primary : t.faint).padding(.top, 2)
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(alignment: .top) {
                                        Text(p.name).font(t.text(16, weight: .medium)).foregroundStyle(t.ink)
                                        if dupNames.contains(p.name) { PillView(text: "已存在 · 将更新", style: .primarySoft) }
                                        Spacer()
                                        PillView(text: "信心 \(p.confidenceLabel)", style: p.confidence == "high" ? .visited : p.confidence == "medium" ? .want : .mute)
                                    }
                                    Text(p.address).font(t.text(13)).foregroundStyle(t.muted)
                                    if !p.cuisine.isEmpty {
                                        FlowLayout(spacing: 5) {
                                            ForEach(p.cuisine.prefix(5), id: \.self) { TagView(text: $0) }
                                            if let pr = p.priceRange { TagView(text: pr.rangeLabel) }
                                        }
                                    }
                                    if let r = p.reason, !r.isEmpty { Text("“\(r)”").font(t.text(13)).foregroundStyle(t.ink2).lineLimit(2) }
                                    if let n = p.notes, !n.isEmpty {
                                        Text("🤖 \(n)").font(t.text(12)).foregroundStyle(t.primarySoftTx).lineLimit(3)
                                            .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                                            .background(t.primarySoft).clipShape(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous))
                                    }
                                    let photos = (p.photoIndices ?? []).filter { $0 >= 0 && $0 < model.displayPhotos.count }.map { model.displayPhotos[$0] }
                                    if !photos.isEmpty {
                                        ScrollView(.horizontal, showsIndicators: false) {
                                            HStack(spacing: 6) {
                                                ForEach(Array(photos.enumerated()), id: \.offset) { _, u in
                                                    RemoteImage(url: u).frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: t.radii.xs))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            .biteCard(padding: 12, radius: t.radii.md, background: checked ? t.primarySoft.opacity(0.35) : nil)
                        }
                        .buttonStyle(.plain)
                    }

                    if let e = model.saveError { ErrorBanner(message: e) }

                    Button(model.saving ? "保存中…" : model.selected.isEmpty ? "未选择" : dupSelected > 0 ? "保存 \(model.selected.count) 家（\(dupSelected) 家覆盖更新）" : "保存选中的 \(model.selected.count) 家") {
                        Task { if await model.saveMulti(session) { onDone() } }
                    }
                    .buttonStyle(.bite(.primary, full: true))
                    .disabled(model.saving || model.selected.isEmpty || model.selectedListId.isEmpty)
                    Text("保存后可在 list 详情页点单个店进编辑页细调字段").font(t.text(12)).foregroundStyle(t.faint).frame(maxWidth: .infinity)
                }
                .padding(16)
            }
        }
    }
}
