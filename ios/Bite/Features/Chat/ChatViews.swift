import SwiftUI
import BiteCore

/// 聊天 tab 首页：会话列表（按 今天 / 昨天 / 本周 / 本月 / 更早 分组）
struct ChatHomeView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @State private var conversations: [Conversation] = []
    @State private var loading = true
    @State private var renaming: Conversation?
    @State private var confirmDelete: Conversation?

    private enum Bucket: String, CaseIterable { case today = "今天", yesterday = "昨天", week = "本周", month = "本月", older = "更早" }

    private func bucket(_ c: Conversation) -> Bucket {
        guard let d = BiteDate.parse(c.updatedAt) else { return .older }
        let cal = Calendar.current
        let startToday = cal.startOfDay(for: Date())
        if d >= startToday { return .today }
        if d >= cal.date(byAdding: .day, value: -1, to: startToday)! { return .yesterday }
        if d >= cal.date(byAdding: .day, value: -7, to: startToday)! { return .week }
        if d >= cal.date(byAdding: .day, value: -30, to: startToday)! { return .month }
        return .older
    }

    var body: some View {
        List {
            Section {
                NavigationLink(value: AppRoute.conversation(id: nil, scopeListId: nil)) {
                    Label("新对话", systemImage: "plus.bubble").font(t.text(15, weight: .semibold)).foregroundStyle(t.primary)
                }
            }
            if conversations.isEmpty, !loading {
                Section { Text("还没有对话").font(t.text(13)).foregroundStyle(t.muted) }
            }
            ForEach(Bucket.allCases, id: \.self) { b in
                let items = conversations.filter { bucket($0) == b }
                if !items.isEmpty {
                    Section(b.rawValue) {
                        ForEach(items) { c in
                            NavigationLink(value: AppRoute.conversation(id: c.id, scopeListId: nil)) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.title ?? "新对话").font(t.text(15)).foregroundStyle(t.ink).lineLimit(2)
                                    Text(c.provider.label).font(t.text(11)).foregroundStyle(t.faint)
                                }
                            }
                            .swipeActions {
                                Button(role: .destructive) { confirmDelete = c } label: { Label("删除", systemImage: "trash") }
                                Button { renaming = c } label: { Label("重命名", systemImage: "pencil") }.tint(t.sage)
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(t.bg)
        .navigationTitle("聊天")
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $renaming) { c in
            RenameSheet(title: "重命名会话", initial: c.title ?? "") { title in
                try await session.repos.chat.rename(id: c.id, title: title)
                await load()
            }
            .presentationDetents([.height(220)])
        }
        .confirmationDialog("删除这个对话？无法撤销。",
                            isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
                            titleVisibility: .visible) {
            Button("删除", role: .destructive) {
                if let c = confirmDelete { Task { try? await session.repos.chat.delete(id: c.id); await load() } }
            }
        }
    }

    private func load() async {
        guard let uid = session.userId else { return }
        loading = true
        conversations = (try? await session.repos.chat.conversations(userId: uid, limit: 50)) ?? []
        loading = false
    }
}

/// 一个会话
struct ChatView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    let conversationId: String?
    let scopeListId: String?
    @State private var model = ChatModel()
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if model.messages.isEmpty, !model.loading {
                            EmptyChatState(scopeName: model.scopeList?.name) { model.send(session, text: $0) }
                        }
                        ForEach(Array(model.messages.enumerated()), id: \.element.id) { i, m in
                            let isLastAssistant = i == model.messages.count - 1 && !m.isUser && !m.streaming && !m.content.isEmpty
                            MessageBubble(message: m, model: model, onRegenerate: isLastAssistant && model.conversationId != nil ? { model.send(session, regenerate: true) } : nil)
                        }
                        if let e = model.error {
                            VStack(alignment: .leading, spacing: 8) {
                                ErrorBanner(message: e)
                                if model.lastFailedText != nil { Button("重试") { model.retry(session) }.buttonStyle(.bite(.ghost, compact: true)) }
                            }
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(16)
                }
                .onChange(of: model.messages.last?.content.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: model.messages.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            }
            inputBar
        }
        .background(t.bg)
        .environment(\.openURL, OpenURLAction { url in
            if url.scheme == Env.urlScheme { session.handleURL(url); return .handled }
            return .systemAction
        })
        .navigationTitle(model.headerTitle ?? "新对话")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load(session, conversationId: conversationId, scopeListId: scopeListId) }
        .onDisappear { model.stop() }
    }

    private var header: some View {
        HStack {
            if let s = model.scopeList {
                Label("只从「\(s.name)」里挑", systemImage: "list.bullet").font(t.text(12)).foregroundStyle(t.muted).lineLimit(1)
            }
            Spacer()
            if !model.providerLabel.isEmpty {
                HStack(spacing: 5) {
                    Circle().fill(t.sage).frame(width: 6, height: 6)
                    Text(model.providerLabel).font(t.text(11, weight: .medium))
                    if !model.modelName.isEmpty { Text("· \(String(model.modelName.prefix(16)))").font(t.text(11)).foregroundStyle(t.faint) }
                }
                .foregroundStyle(t.muted)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(t.surface2).clipShape(Capsule())
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(t.bg)
        .overlay(alignment: .bottom) { Rectangle().fill(t.border).frame(height: 1) }
    }

    private var inputBar: some View {
        VStack(spacing: 4) {
            HStack(alignment: .bottom, spacing: 8) {
                TextField("今晚和女朋友吃啥？想要日料、200 块以内…", text: $model.input, axis: .vertical)
                    .lineLimit(1...5).focused($focused).biteField()
                    .disabled(model.sending)
                if model.sending {
                    Button("停止") { model.stop() }.buttonStyle(.bite(.ghost))
                } else {
                    Button { model.send(session) } label: { Label("发送", systemImage: "paperplane.fill") }
                        .buttonStyle(.bite(.primary))
                        .disabled(model.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.input.count > 4000)
                }
            }
            if model.input.count >= 3500 {
                Text("\(model.input.count) / 4000" + (model.input.count > 4000 ? " · 超出上限" : ""))
                    .font(t.text(11)).foregroundStyle(model.input.count > 4000 ? t.danger : t.goldTx)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(t.bg)
        .overlay(alignment: .top) { Rectangle().fill(t.border).frame(height: 1) }
    }
}

private struct EmptyChatState: View {
    @Environment(\.bite) private var t
    var scopeName: String?
    var onPick: (String) -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "sparkles").font(.system(size: 22)).foregroundStyle(t.primary)
                .frame(width: 48, height: 48).background(t.primarySoft).clipShape(Circle())
            Text(scopeName.map { "从「\($0)」里挑" } ?? "和你的餐厅库聊聊").font(t.display(20)).foregroundStyle(t.ink)
            Text(scopeName != nil ? "告诉我想吃啥 / 跟谁 / 预算多少，我只在这个清单里挑。想找别的清单直接说就行。"
                 : "告诉我你想吃啥 / 跟谁 / 预算多少，我从你的 list 里挑 2-3 家并给出理由。")
                .font(t.text(14)).foregroundStyle(t.muted).multilineTextAlignment(.center)
            FlowLayout(spacing: 8) {
                ForEach(ChatModel.quickPrompts, id: \.self) { p in
                    Button(p) { onPick(p) }.buttonStyle(.bite(.ghost, compact: true))
                }
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36).padding(.horizontal, 20)
        .biteCard(padding: 0)
    }
}

/// 一条消息：文本（«店名» 链接化）+ 工具卡片 + 推荐卡 + 时间戳 / 复制 / 重新生成
private struct MessageBubble: View {
    @Environment(\.bite) private var t
    var message: ChatModel.DisplayMessage
    var model: ChatModel
    var onRegenerate: (() -> Void)?
    @State private var copied = false

    private var assistantText: String {
        message.content.compactMap(\.textValue).joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var mentioned: [(String, ChatModel.PlaceRef)] {
        guard !message.isUser else { return [] }
        var seen = Set<String>()
        var out: [(String, ChatModel.PlaceRef)] = []
        for b in message.content {
            guard let text = b.textValue else { continue }
            for name in Linkify.mentionedNames(text) where !seen.contains(name) {
                if let ref = model.placeMap[name] { seen.insert(name); out.append((name, ref)) }
            }
        }
        return out
    }

    var body: some View {
        VStack(alignment: message.isUser ? .trailing : .leading, spacing: 6) {
            VStack(alignment: .leading, spacing: 6) {
                if message.content.isEmpty, message.streaming {
                    Text("···").font(t.text(18)).foregroundStyle(t.faint)
                }
                ForEach(Array(paired.enumerated()), id: \.offset) { _, item in
                    switch item {
                    case .text(let s):
                        LinkifiedText(text: s, isUser: message.isUser, map: model.linkMap)
                    case .tool(let use, let result):
                        ToolCallCard(use: use, result: result)
                    }
                }
                if message.streaming, !message.content.isEmpty {
                    Rectangle().fill(t.primary.opacity(0.5)).frame(width: 6, height: 14)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(message.isUser ? t.primary : t.surface)
            .foregroundStyle(message.isUser ? t.onPrimary : t.ink2)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(message.isUser ? .clear : t.border, lineWidth: t.bw))
            .frame(maxWidth: 320, alignment: message.isUser ? .trailing : .leading)

            if !message.streaming, !mentioned.isEmpty {
                VStack(spacing: 8) {
                    ForEach(mentioned, id: \.0) { name, ref in RecCard(name: name, ref: ref) }
                }
                .frame(maxWidth: 320)
            }

            HStack(spacing: 10) {
                if let c = message.createdAt { Text(RelDate.brief(c)).font(t.text(10)).foregroundStyle(t.faint) }
                if !message.isUser, !assistantText.isEmpty, !message.streaming {
                    Button(copied ? "已复制" : "复制") { UIPasteboard.general.string = assistantText; copied = true }
                        .font(t.text(10)).foregroundStyle(t.muted)
                }
                if let onRegenerate {
                    Button { onRegenerate() } label: { Label("重新生成", systemImage: "arrow.clockwise") }.font(t.text(10)).foregroundStyle(t.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isUser ? .trailing : .leading)
    }

    private enum Item {
        case text(String)
        case tool(use: (id: String, name: String, input: BiteJSON), result: String?)
    }

    private var paired: [Item] {
        var results: [String: String] = [:]
        for b in message.content { if case .toolResult(let id, let content, _) = b { results[id] = content } }
        var out: [Item] = []
        for b in message.content {
            switch b {
            case .text(let s): out.append(.text(s))
            case .toolUse(let id, let name, let input): out.append(.tool(use: (id, name, input), result: results[id]))
            case .toolResult: break
            }
        }
        return out
    }
}

/// «店名» → 可点链接
private struct LinkifiedText: View {
    @Environment(\.bite) private var t
    var text: String
    var isUser: Bool
    var map: [String: Linkify.PlaceRef]

    var body: some View {
        let segs = Linkify.segments(text, placeMap: map)
        var str = AttributedString()
        for s in segs {
            switch s {
            case .text(let x), .raw(let x):
                str.append(AttributedString(x))
            case .link(let name, let listId, let placeId):
                var a = AttributedString(name)
                a.link = URL(string: "\(Env.urlScheme)://lists/\(listId)/places/\(placeId)")
                a.underlineStyle = .single
                a.foregroundColor = isUser ? t.onPrimary : t.primary
                str.append(a)
            }
        }
        return Text(str).font(t.text(14)).lineSpacing(3).textSelection(.enabled)
    }
}

/// 工具调用卡片（可展开看参数 / 结果）
private struct ToolCallCard: View {
    @Environment(\.bite) private var t
    var use: (id: String, name: String, input: BiteJSON)
    var result: String?
    @State private var expanded: Bool?

    var body: some View {
        let status = ToolSummary.summarize(toolName: use.name, content: result)
        let isError = status.kind == .error
        let open = expanded ?? isError
        VStack(alignment: .leading, spacing: 0) {
            Button { expanded = !open } label: {
                HStack(spacing: 8) {
                    Image(systemName: result == nil ? "clock" : isError ? "xmark" : "checkmark").font(.system(size: 11, weight: .bold))
                        .foregroundStyle(isError ? t.danger : t.primary)
                    Text(ToolSummary.label(forTool: use.name)).font(.system(size: 12, design: .monospaced)).foregroundStyle(isError ? t.danger : t.primary)
                    Text(status.summary).font(t.text(12)).foregroundStyle(t.muted).lineLimit(1)
                    Spacer()
                    Image(systemName: open ? "chevron.down" : "chevron.right").font(.system(size: 10)).foregroundStyle(t.faint)
                }
                .padding(.horizontal, 10).padding(.vertical, 6)
            }
            .buttonStyle(.plain)
            if open {
                VStack(alignment: .leading, spacing: 6) {
                    if let o = use.input.objectValue, !o.isEmpty {
                        Text("参数").font(t.text(10, weight: .semibold)).foregroundStyle(t.muted)
                        Text(use.input.prettyPrinted).font(.system(size: 11, design: .monospaced)).foregroundStyle(t.ink2)
                    }
                    if let result {
                        Text("结果").font(t.text(10, weight: .semibold)).foregroundStyle(t.muted)
                        ScrollView { Text(ToolSummary.prettyJson(result)).font(.system(size: 11, design: .monospaced)).foregroundStyle(t.ink2) }
                            .frame(maxHeight: 200)
                    }
                }
                .padding(10)
                .overlay(alignment: .top) { Rectangle().fill(t.border).frame(height: 1) }
            }
        }
        .background(t.surface2)
        .clipShape(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous).stroke(t.border, lineWidth: t.bw))
    }
}

/// 库内被 AI 提到的店 → 可操作推荐卡
private struct RecCard: View {
    @Environment(\.bite) private var t
    var name: String
    var ref: ChatModel.PlaceRef

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            RemoteImage(url: ref.photo).frame(width: 74, height: 74).clipShape(RoundedRectangle(cornerRadius: t.radii.sm, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(name).font(t.text(14.5, weight: .bold)).foregroundStyle(t.ink).lineLimit(1)
                    PillView(text: ref.status.label, style: ref.status.pillStyle)
                }
                let meta = [ref.cuisine.first, ref.price].compactMap { $0 }.joined(separator: " · ")
                if !meta.isEmpty { Text(meta).font(t.text(11.5)).foregroundStyle(t.muted) }
                if let why = ref.why, !why.isEmpty {
                    Text(why).font(t.text(12)).foregroundStyle(t.ink2).lineLimit(2)
                        .padding(.horizontal, 9).padding(.vertical, 6)
                        .background(t.surface2).clipShape(RoundedRectangle(cornerRadius: t.radii.xs, style: .continuous))
                }
                HStack(spacing: 7) {
                    NavigationLink(value: AppRoute.place(listId: ref.listId, placeId: ref.id)) { Text("看详情") }
                        .buttonStyle(.bite(.primary, compact: true))
                    Link("看菜单", destination: ExternalLinks.menuSearchURL(name: name, address: nil))
                        .buttonStyle(.bite(.ghost, compact: true))
                }
                .padding(.top, 4)
            }
        }
        .biteCard(padding: 11)
    }
}
