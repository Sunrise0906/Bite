import SwiftUI
import BiteCore

/// 一个会话的状态机：历史加载 + SSE 流式 + 工具卡片配对（web 的 chat-view.tsx）
@MainActor
@Observable
final class ChatModel {
    struct DisplayMessage: Identifiable {
        let id = UUID()
        var role: String
        var content: [LlmContentBlock]
        var createdAt: String?
        var streaming = false
        var isUser: Bool { role == "user" }
    }

    struct PlaceRef: Hashable {
        var id: String
        var listId: String
        var photo: String?
        var cuisine: [String]
        var status: PlaceStatus
        var price: String?
        var why: String?
    }

    var conversationId: String?
    var messages: [DisplayMessage] = []
    var input = ""
    var sending = false
    var error: String?
    var lastFailedText: String?
    var placeMap: [String: PlaceRef] = [:]
    var scopeList: (id: String, name: String)?
    var headerTitle: String?
    var providerLabel = ""
    var modelName = ""
    var loading = false
    private var streamTask: Task<Void, Never>?

    static let quickPrompts = ["今晚一个人吃啥", "明天约会，日料 200 内", "周末和朋友聚会", "想吃面，省时间"]

    func load(_ session: AppSession, conversationId: String?, scopeListId: String?) async {
        loading = true
        defer { loading = false }
        self.conversationId = conversationId
        var scopeId = scopeListId
        if let cid = conversationId, let convo = try? await session.repos.chat.conversation(id: cid) {
            headerTitle = convo.title
            providerLabel = convo.provider.label
            modelName = convo.model ?? ""
            scopeId = convo.scopeListId
            if let rows = try? await session.repos.chat.messages(conversationId: cid) {
                messages = Self.fold(rows)
            }
        } else {
            providerLabel = ProviderId.gemini.label
            modelName = ""
            if let r = try? await session.api.llmSettings() {
                let p = r.settings?.provider ?? .gemini
                providerLabel = p.label
                modelName = r.settings?.chatModel ?? r.presets[p.rawValue]?.chatModel ?? ""
            }
        }
        if let scopeId, let l = try? await session.repos.lists.fetch(id: scopeId) { scopeList = (l.id, l.name) } else { scopeList = nil }
        await loadPlaceMap(session)
    }

    /// 把「只含 tool_result 的 user 消息」折进上一条 assistant，让 UI 配对显示
    static func fold(_ rows: [MessageRow]) -> [DisplayMessage] {
        var out: [DisplayMessage] = []
        for row in rows {
            let onlyToolResult = row.isUser && !row.content.isEmpty && row.content.allSatisfy { if case .toolResult = $0 { return true }; return false }
            if onlyToolResult, let last = out.last, !last.isUser {
                out[out.count - 1].content.append(contentsOf: row.content)
                continue
            }
            out.append(DisplayMessage(role: row.role, content: row.content, createdAt: row.createdAt))
        }
        return out
    }

    private func loadPlaceMap(_ session: AppSession) async {
        guard let uid = session.userId else { return }
        do {
            let lists = try await session.repos.lists.fetchAll()
            let places = try await session.repos.places.fetchForLists(lists.map(\.id))
            let signed = await session.photos.signedMap(for: places.compactMap(\.coverUrl))
            var map: [String: PlaceRef] = [:]
            for p in places {
                let why = p.shownReason(for: uid)?.text ?? p.notes.map { String($0.prefix(60)) }
                map[p.name] = PlaceRef(id: p.id, listId: p.listId, photo: p.coverUrl.map { signed[$0] ?? $0 }, cuisine: p.cuisine,
                                       status: p.status, price: p.priceRange?.rawValue, why: why)
            }
            placeMap = map
        } catch {
            // 链接化只是锦上添花，失败不影响聊天
        }
    }

    var linkMap: [String: Linkify.PlaceRef] { placeMap.mapValues { Linkify.PlaceRef(id: $0.id, listId: $0.listId) } }

    func stop() {
        streamTask?.cancel()
    }

    func send(_ session: AppSession, text: String? = nil, regenerate: Bool = false) {
        guard !sending else { return }
        let msg = regenerate ? "" : (text ?? input).trimmingCharacters(in: .whitespacesAndNewlines)
        if !regenerate, msg.isEmpty { return }
        if regenerate, conversationId == nil { return }
        if !regenerate, text == nil { input = "" }
        sending = true; error = nil; lastFailedText = nil

        if regenerate {
            while let last = messages.last, !last.isUser { messages.removeLast() }
        } else {
            messages.append(DisplayMessage(role: "user", content: [.text(msg)], createdAt: BiteDate.string(Date())))
        }
        messages.append(DisplayMessage(role: "assistant", content: [], streaming: true))

        let req = ChatRequest(conversationId: conversationId, message: regenerate ? nil : msg,
                              regenerate: regenerate ? true : nil, listId: scopeList?.id)
        streamTask = Task { [weak self] in
            guard let self else { return }
            var blocks: [LlmContentBlock] = []
            var currentText = ""
            // ⚠️ 必须显式 @MainActor：嵌套函数**不继承**外层闭包的 actor 隔离
            // （闭包继承，局部 func 不继承）。少了它，这里碰 self.messages 会报
            // 「main actor-isolated property can not be referenced from a nonisolated context」。
            @MainActor func flush() {
                var final = blocks
                if !currentText.isEmpty { final.append(.text(currentText)) }
                if let i = self.messages.indices.last { self.messages[i].content = final }
            }
            do {
                for try await ev in session.api.chatStream(req) {
                    switch ev {
                    case .meta(let cid, _):
                        if self.conversationId != cid { self.conversationId = cid }
                    case .text(let delta):
                        currentText += delta
                        flush()
                    case .toolUseStart(let id, let name):
                        if !currentText.isEmpty { blocks.append(.text(currentText)); currentText = "" }
                        blocks.append(.toolUse(id: id, name: name, input: .object([:])))
                        flush()
                    case .toolUseDone(let id, let name, let input):
                        if let i = blocks.firstIndex(where: { if case .toolUse(let bid, _, _) = $0 { return bid == id }; return false }) {
                            blocks[i] = .toolUse(id: id, name: name, input: input)
                        }
                        flush()
                    case .toolResult(let id, _, let result):
                        blocks.append(.toolResult(toolUseId: id, content: result, isError: false))
                        flush()
                    case .error(let message):
                        self.error = message
                        if !regenerate { self.lastFailedText = msg }
                    case .toolUseInputDelta, .toolExecuting, .usage, .done, .unknown:
                        break
                    }
                }
            } catch {
                if !(error is CancellationError) {
                    self.error = ErrorText.friendly(error)
                    if !regenerate { self.lastFailedText = msg }
                }
            }
            if let i = self.messages.indices.last {
                self.messages[i].streaming = false
                self.messages[i].createdAt = BiteDate.string(Date())
                if self.messages[i].content.isEmpty { self.messages.remove(at: i) }
            }
            self.sending = false
            if self.headerTitle == nil, !msg.isEmpty { self.headerTitle = String(msg.prefix(30)) }
        }
    }

    func retry(_ session: AppSession) {
        guard let text = lastFailedText else { return }
        if let last = messages.last, last.isUser, last.content.first?.textValue == text { messages.removeLast() }
        send(session, text: text)
    }
}
