import SwiftUI
import BiteCore

/// 成员名单（所有成员可见；改角色 / 移除只有 owner）
struct MembersPanel: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var listId: String
    var members: [ListDetailModel.MemberDisplay]
    var canManage: Bool
    var reload: () async -> Void
    @State private var busyId: String?
    @State private var confirmRemove: ListDetailModel.MemberDisplay?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("成员 · \(members.count)", systemImage: "person.2")
                .font(t.text(12, weight: .semibold)).foregroundStyle(t.muted).textCase(.uppercase)
            ForEach(members) { m in
                HStack(spacing: 8) {
                    PillView(text: "@\(m.displayName)", style: .sage)
                    if m.active {
                        HStack(spacing: 4) { Circle().fill(t.sage).frame(width: 6, height: 6); Text("刚刚在线") }
                            .font(t.text(11)).foregroundStyle(t.sageTx)
                    }
                    if canManage {
                        Button { Task { await toggleRole(m) } } label: { PillView(text: m.role.label, style: .mute) }
                            .disabled(busyId == m.userId)
                    } else {
                        PillView(text: m.role.label, style: .mute)
                    }
                    Spacer()
                    if canManage {
                        Button("移除") { confirmRemove = m }.font(t.text(12)).foregroundStyle(t.danger).disabled(busyId == m.userId)
                    }
                }
                .biteCard(padding: 10, radius: t.radii.md)
            }
        }
        .confirmationDialog("把 @\(confirmRemove?.displayName ?? "") 移出这个 list？",
                            isPresented: Binding(get: { confirmRemove != nil }, set: { if !$0 { confirmRemove = nil } }),
                            titleVisibility: .visible) {
            Button("移除", role: .destructive) { if let m = confirmRemove { Task { await remove(m) } } }
        }
    }

    private func toggleRole(_ m: ListDetailModel.MemberDisplay) async {
        busyId = m.userId; defer { busyId = nil }
        let next: ListMemberRole = m.role == .coOwner ? .viewer : .coOwner
        do { try await session.repos.lists.changeRole(listId: listId, userId: m.userId, role: next); await reload() }
        catch { session.showError(error) }
    }

    private func remove(_ m: ListDetailModel.MemberDisplay) async {
        busyId = m.userId; defer { busyId = nil }
        do { try await session.repos.lists.removeMember(listId: listId, userId: m.userId); await reload() }
        catch { session.showError(error) }
    }
}

/// 活跃邀请链接（复制 / 撤销）
struct ActiveInvitesPanel: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var invites: [ListInvite]
    var reload: () async -> Void
    @State private var copied: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("活跃邀请链接 · \(invites.count)", systemImage: "link")
                .font(t.text(12, weight: .semibold)).foregroundStyle(t.muted)
            ForEach(invites) { inv in
                HStack(spacing: 8) {
                    PillView(text: inv.role.label, style: .sage)
                    Text("到期：\(RelDate.ymd(inv.expiresAt))").font(t.text(11)).foregroundStyle(t.faint)
                    Spacer()
                    Button(copied == inv.token ? "已复制" : "复制链接") {
                        UIPasteboard.general.string = inviteURL(inv.token)
                        copied = inv.token
                    }
                    .font(t.text(12)).foregroundStyle(t.ink)
                    Button("撤销") { Task { await revoke(inv) } }.font(t.text(12)).foregroundStyle(t.danger)
                }
                .biteCard(padding: 10, radius: t.radii.md)
            }
        }
    }

    private func revoke(_ inv: ListInvite) async {
        do { try await session.repos.invites.revoke(token: inv.token); await reload() }
        catch { session.showError(error) }
    }
}

/// 邀请链接用网页域名：对方没装 App 也能在浏览器里接受；装了 App（配了 universal links）会直接在 App 里打开
func inviteURL(_ token: String) -> String {
    "\(Env.apiBaseURLString)/invite/\(token)"
}

/// 生成邀请链接
struct InviteSheet: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bite) private var t
    var listId: String
    var onCreated: () async -> Void

    @State private var role: ListMemberRole = .coOwner
    @State private var created: ListInvite?
    @State private var busy = false
    @State private var error: String?
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("邀请加入 list").font(t.display(20)).foregroundStyle(t.ink)
            Text("生成一条单次使用的邀请链接，发给朋友。7 天有效。").font(t.text(13)).foregroundStyle(t.muted)

            if let inv = created {
                Text("邀请链接").font(t.text(12, weight: .semibold)).foregroundStyle(t.muted)
                Text(inviteURL(inv.token)).font(.system(size: 12, design: .monospaced)).foregroundStyle(t.ink)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(t.surface2).clipShape(RoundedRectangle(cornerRadius: t.radii.sm, style: .continuous))
                Text("过期时间：\(RelDate.ymd(inv.expiresAt))").font(t.text(11)).foregroundStyle(t.faint)
                HStack {
                    ShareLink(item: URL(string: inviteURL(inv.token))!) { Label("分享", systemImage: "square.and.arrow.up") }
                        .buttonStyle(.bite(.ghost))
                    Spacer()
                    Button("关闭") { dismiss() }.buttonStyle(.bite(.ghost))
                    Button(copied ? "已复制" : "复制链接") {
                        UIPasteboard.general.string = inviteURL(inv.token); copied = true
                    }
                    .buttonStyle(.bite(.primary))
                }
            } else {
                Text("角色").font(t.text(12, weight: .semibold)).foregroundStyle(t.muted)
                HStack(spacing: 8) {
                    roleCard(.coOwner, title: "共同所有者", sub: "能加 / 改 / 删店")
                    roleCard(.viewer, title: "查看者", sub: "只读")
                }
                if let error { ErrorBanner(message: error) }
                HStack {
                    Spacer()
                    Button("取消") { dismiss() }.buttonStyle(.bite(.ghost))
                    Button(busy ? "生成中…" : "生成链接") { Task { await generate() } }.buttonStyle(.bite(.primary)).disabled(busy)
                }
            }
            Spacer()
        }
        .padding(20)
        .background(t.bg)
    }

    private func roleCard(_ r: ListMemberRole, title: String, sub: String) -> some View {
        Button { role = r } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(t.text(14, weight: .medium)).foregroundStyle(role == r ? t.primarySoftTx : t.ink)
                Text(sub).font(t.text(12)).foregroundStyle(t.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(role == r ? t.primarySoft : t.surface)
            .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous).stroke(role == r ? t.primary : t.border, lineWidth: t.bw))
        }
        .buttonStyle(.plain)
    }

    private func generate() async {
        guard let uid = session.userId else { return }
        busy = true; error = nil
        defer { busy = false }
        do {
            created = try await session.repos.invites.create(listId: listId, createdBy: uid, role: role)
            await onCreated()
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }
}
