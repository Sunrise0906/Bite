import SwiftUI
import BiteCore

/// 「我的清单」区块 + 管理模式（改名 / 删除 / 离开），web 的 my-lists-section.tsx
struct MyListsSection: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var lists: [HomeModel.ListVM]
    var reload: () async -> Void

    @State private var manage = false
    @State private var renaming: HomeModel.ListVM?
    @State private var confirmDelete: HomeModel.ListVM?
    @State private var confirmLeave: HomeModel.ListVM?
    @State private var busyId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "我的清单", trailing: lists.isEmpty ? nil : (manage ? "完成" : "管理"), trailingOn: manage) {
                manage.toggle()
            }
            if lists.isEmpty {
                EmptyStateView(title: "还没有清单", subtitle: "在下面输入个名字，比如「Irvine 想吃的」")
            } else {
                VStack(spacing: 9) {
                    ForEach(lists) { l in
                        if manage {
                            manageRow(l)
                        } else {
                            NavigationLink(value: AppRoute.list(l.id)) { ListRow(list: l) }
                                .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .sheet(item: $renaming) { l in
            RenameSheet(title: "重命名清单", initial: l.name) { name in
                try await session.repos.lists.rename(id: l.id, name: name)
                session.showToast("已重命名")
                await reload()
            }
            .presentationDetents([.height(220)])
        }
        .confirmationDialog("确认删除清单「\(confirmDelete?.name ?? "")」？这会同时删除其中所有的店铺记录与造访日志，且无法撤销。",
                            isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
                            titleVisibility: .visible) {
            Button("删除清单", role: .destructive) { if let l = confirmDelete { Task { await delete(l) } } }
        }
        .confirmationDialog("离开「\(confirmLeave?.name ?? "")」？你将无法再访问。",
                            isPresented: Binding(get: { confirmLeave != nil }, set: { if !$0 { confirmLeave = nil } }),
                            titleVisibility: .visible) {
            Button("离开", role: .destructive) { if let l = confirmLeave { Task { await leave(l) } } }
        }
    }

    private func manageRow(_ l: HomeModel.ListVM) -> some View {
        HStack(spacing: 12) {
            ListThumbs(thumbs: l.thumbs)
            ListMeta(list: l)
            Spacer(minLength: 0)
            VStack(spacing: 6) {
                if l.canEdit {
                    Button("重命名") { renaming = l }.buttonStyle(.bite(.ghost, compact: true))
                }
                if l.isOwner {
                    Button("删除") { confirmDelete = l }.buttonStyle(.bite(.danger, compact: true))
                } else {
                    Button("离开") { confirmLeave = l }.buttonStyle(.bite(.danger, compact: true))
                }
            }
        }
        .biteCard(padding: 11, radius: t.radii.md)
        .opacity(busyId == l.id ? 0.55 : 1)
    }

    private func delete(_ l: HomeModel.ListVM) async {
        busyId = l.id; defer { busyId = nil }
        do { try await session.repos.lists.delete(id: l.id); session.showToast("list 已删除"); await reload() }
        catch { session.showError(error) }
    }

    private func leave(_ l: HomeModel.ListVM) async {
        guard let uid = session.userId else { return }
        busyId = l.id; defer { busyId = nil }
        do { try await session.repos.lists.leave(listId: l.id, userId: uid); session.showToast("已离开清单"); await reload() }
        catch { session.showError(error) }
    }
}

struct ListRow: View {
    @Environment(\.bite) private var t
    var list: HomeModel.ListVM

    var body: some View {
        HStack(spacing: 12) {
            ListThumbs(thumbs: list.thumbs)
            ListMeta(list: list)
            Spacer(minLength: 0)
            Text("\(list.count)").font(t.display(22)).foregroundStyle(t.ink)
        }
        .biteCard(padding: 11, radius: t.radii.md)
    }
}

struct ListThumbs: View {
    @Environment(\.bite) private var t
    var thumbs: [String]

    var body: some View {
        HStack(spacing: -12) {
            if thumbs.isEmpty {
                thumb(nil)
            } else {
                ForEach(Array(thumbs.prefix(3).enumerated()), id: \.offset) { _, u in thumb(u) }
            }
        }
    }

    private func thumb(_ url: String?) -> some View {
        RemoteImage(url: url)
            .frame(width: 38, height: 38)
            .clipShape(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous).stroke(t.surface, lineWidth: 2))
    }
}

struct ListMeta: View {
    @Environment(\.bite) private var t
    var list: HomeModel.ListVM

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 7) {
                Text(list.name).font(t.text(14.5, weight: .bold)).foregroundStyle(t.ink).lineLimit(1)
                if list.isShared { PillView(text: "共享", style: .visited) }
                if list.category != .food { PillView(text: list.category.label, style: .mute) }
            }
            HStack(spacing: 6) {
                if list.isShared, !list.faces.isEmpty {
                    HStack(spacing: -6) {
                        ForEach(Array(list.faces.enumerated()), id: \.offset) { _, f in
                            AvatarView(initial: f.initial, sage: f.sage, size: 18)
                                .overlay(Circle().stroke(t.surface, lineWidth: 1.5))
                        }
                        if list.memberTotal > 3 {
                            Text("+\(list.memberTotal - 3)").font(t.text(9, weight: .bold)).foregroundStyle(t.muted)
                                .frame(width: 18, height: 18).background(t.surface2).clipShape(Circle())
                        }
                    }
                    Circle().fill(t.sage).frame(width: 6, height: 6)
                }
                Text(list.activityLabel).font(t.text(11.5)).foregroundStyle(t.muted)
            }
        }
    }
}

/// 新建清单（名字 + 吃/喝/玩/其他）
struct CreateListRow: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var onCreated: () async -> Void

    @State private var name = ""
    @State private var category: ListCategory = .food
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                TextField("新建 list，例如 “Irvine 想吃的”", text: $name)
                    .biteField()
                    .submitLabel(.done)
                    .onSubmit { Task { await create() } }
                Button(busy ? "创建中…" : "新建") { Task { await create() } }
                    .buttonStyle(.bite(.primary))
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            HStack(spacing: 7) {
                ForEach(ListCategory.allCases, id: \.self) { c in
                    FilterChip(text: c.label, on: category == c) { category = c }
                }
            }
            if let error { ErrorBanner(message: error) }
        }
        .padding(.top, 14)
    }

    private func create() async {
        guard let uid = session.userId else { return }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        guard trimmed.count <= 80 else { error = "名称不超过 80 字"; return }
        busy = true; error = nil
        defer { busy = false }
        do {
            let id = try await session.repos.lists.create(name: trimmed, category: category, ownerId: uid)
            name = ""; category = .food
            session.showToast("已创建 list")
            await onCreated()
            session.router.listsPath.append(.list(id))
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }
}

/// 通用的「改名」sheet
struct RenameSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bite) private var t
    var title: String
    var initial: String
    var maxLength: Int = 80
    var save: (String) async throws -> Void

    @State private var text = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(t.display(18)).foregroundStyle(t.ink)
            TextField("", text: $text).biteField()
            if let error { ErrorBanner(message: error) }
            HStack {
                Spacer()
                Button("取消") { dismiss() }.buttonStyle(.bite(.ghost))
                Button(busy ? "保存中…" : "保存") { Task { await submit() } }
                    .buttonStyle(.bite(.primary))
                    .disabled(busy || text.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .background(t.bg)
        .onAppear { text = initial }
    }

    private func submit() async {
        let v = text.trimmingCharacters(in: .whitespaces)
        guard !v.isEmpty else { return }
        guard v.count <= maxLength else { error = "不超过 \(maxLength) 字"; return }
        busy = true; error = nil
        defer { busy = false }
        do { try await save(v); dismiss() } catch { self.error = ErrorText.friendly(error) }
    }
}
