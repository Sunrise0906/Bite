import SwiftUI
import BiteCore

/// 店铺留言（sql/0025）：清单成员之间真正的对话。发送走 API（要推送给其他成员），删除直连。
struct CommentThread: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var placeId: String
    @Binding var comments: [CommentView]
    var addedBy: String?
    var addedAt: String?

    @State private var text = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(title: comments.isEmpty ? "留言" : "留言 · \(comments.count)")
            if let addedBy {
                HStack(spacing: 4) {
                    Text(addedBy == "你" ? "你" : "@\(addedBy)").fontWeight(.bold)
                    Text("加了这家店")
                    if let addedAt { Text("· \(RelDate.label(addedAt))").foregroundStyle(t.faint) }
                }
                .font(t.text(12.5)).foregroundStyle(t.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 13).padding(.vertical, 10)
                .overlay(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous).strokeBorder(style: StrokeStyle(lineWidth: t.bw, dash: [4, 3])).foregroundStyle(t.border))
            }
            ForEach(comments) { c in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text("@\(c.author)").font(t.text(12.5, weight: .bold)).foregroundStyle(t.sageTx)
                        Text(RelDate.label(c.createdAt)).font(t.text(11)).foregroundStyle(t.faint)
                        Spacer()
                        if c.editable {
                            Button("删除") { Task { await remove(c) } }.font(t.text(11)).foregroundStyle(t.muted)
                        }
                    }
                    Text(c.body).font(t.text(13.5)).foregroundStyle(t.ink2).lineSpacing(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .biteCard(padding: 12, radius: t.radii.md)
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField("跟朋友说点什么…", text: $text, axis: .vertical).lineLimit(2...5).biteField()
                Button(busy ? "…" : "发送") { Task { await send() } }
                    .buttonStyle(.bite(.primary))
                    .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.top, 4)
            if let error { Text(error).font(t.text(12)).foregroundStyle(t.danger) }
        }
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        guard body.count <= 1000 else { error = "太长了，1000 字以内"; return }
        busy = true; error = nil
        defer { busy = false }
        do {
            let c = try await session.api.addComment(placeId: placeId, body: body)
            comments.append(c)
            text = ""
        } catch { self.error = ErrorText.friendly(error) }
    }

    private func remove(_ c: CommentView) async {
        do {
            try await session.repos.comments.delete(id: c.id)
            comments.removeAll { $0.id == c.id }
        } catch { self.error = ErrorText.friendly(error) }
    }
}
