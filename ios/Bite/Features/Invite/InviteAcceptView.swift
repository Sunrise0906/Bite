import SwiftUI
import BiteCore

/// 邀请链接落地页（web 的 /invite/[token]）：预览 → 加入
struct InviteAcceptView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bite) private var t
    let token: String
    @State private var preview: InvitePreview?
    @State private var loaded = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("List 邀请").font(t.display(24)).foregroundStyle(t.ink)
                if !loaded {
                    LoadingView()
                } else if let p = preview {
                    if p.ownerId == session.userId {
                        Text("这是你自己创建的邀请。把链接发给朋友就行——你不能自己加入自己。").font(t.text(14)).foregroundStyle(t.ink2)
                        Button("回到 list") { dismiss(); session.router.open(.list(p.listId)) }.buttonStyle(.bite(.ghost))
                    } else if p.isUsed {
                        Text("这个邀请链接已经被使用过了").font(t.text(14)).foregroundStyle(t.muted)
                    } else if p.isExpired {
                        Text("这个邀请链接已过期").font(t.text(14)).foregroundStyle(t.muted)
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("朋友邀请你加入这个 list：").font(t.text(13)).foregroundStyle(t.muted)
                            Text(p.listName).font(t.display(24)).foregroundStyle(t.ink)
                            HStack(spacing: 6) {
                                Text("角色：").font(t.text(12)).foregroundStyle(t.muted)
                                PillView(text: p.role == .coOwner ? "共同所有者（可编辑）" : "查看者（只读）", style: .sage)
                            }
                            if let error { ErrorBanner(message: error) }
                            Button(busy ? "加入中…" : "加入这个 list") { Task { await accept() } }
                                .buttonStyle(.bite(.primary, full: true)).disabled(busy).padding(.top, 8)
                        }
                        .biteCard(padding: 16)
                    }
                } else {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "exclamationmark.triangle").foregroundStyle(t.gold)
                        Text("这个邀请链接无效或已被撤销").font(t.text(14)).foregroundStyle(t.ink2)
                    }
                    .biteCard(padding: 16)
                }
                Spacer()
            }
            .padding(20)
            .background(t.bg)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } } }
            .task { preview = try? await session.repos.invites.preview(token: token); loaded = true }
        }
    }

    private func accept() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let r = try await session.api.acceptInvite(token: token)
            session.showToast("已加入 list")
            dismiss()
            session.router.open(.list(r.listId))
        } catch { self.error = ErrorText.friendly(error) }
    }
}
