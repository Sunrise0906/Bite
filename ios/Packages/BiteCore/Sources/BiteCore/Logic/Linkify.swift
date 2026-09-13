import Foundation

/// AI 回复里 «店名» 的切分（bite/src/lib/chat/linkify.ts）。
/// system prompt 让模型把库里已有的店名用书名号包起来，前端把命中库的渲染成可点链接。
public enum Linkify {
    public enum Segment: Equatable, Sendable {
        case text(String)
        /// 命中库内店：name + 目标 (listId, placeId)
        case link(name: String, listId: String, placeId: String)
        /// «…» 但没命中库，原样显示
        case raw(String)
    }

    public struct PlaceRef: Hashable, Sendable {
        public var id: String
        public var listId: String
        public init(id: String, listId: String) { self.id = id; self.listId = listId }
    }

    public static func segments(_ text: String, placeMap: [String: PlaceRef]) -> [Segment] {
        guard text.contains("«") else { return [.text(text)] }
        var out: [Segment] = []
        var rest = Substring(text)
        while let open = rest.firstIndex(of: "«") {
            let afterOpen = rest.index(after: open)
            guard let close = rest[afterOpen...].firstIndex(of: "»") else { break }
            let name = String(rest[afterOpen..<close])
            let before = String(rest[rest.startIndex..<open])
            if !before.isEmpty { out.append(.text(before)) }
            if name.count >= 1, name.count <= 60, !name.contains("«"), let ref = placeMap[name] {
                out.append(.link(name: name, listId: ref.listId, placeId: ref.id))
            } else {
                out.append(.raw("«\(name)»"))
            }
            rest = rest[rest.index(after: close)...]
        }
        if !rest.isEmpty { out.append(.text(String(rest))) }
        return out
    }

    /// 从一段文本里抽出所有 «店名»（去重保序），给聊天里的推荐卡用
    public static func mentionedNames(_ text: String) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for seg in segments(text, placeMap: [:]) {
            if case .raw(let raw) = seg {
                let name = String(raw.dropFirst().dropLast()).trimmingCharacters(in: .whitespaces)
                if !name.isEmpty, !seen.contains(name) { seen.insert(name); out.append(name) }
            }
        }
        return out
    }
}
