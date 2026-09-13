import Foundation

/// 聊天工具卡片的纯展示逻辑（bite/src/lib/chat/tool-summary.ts）。
public enum ToolSummary {
    public enum Kind: Equatable, Sendable { case ok, error, pending }

    public struct Result: Equatable, Sendable {
        public var kind: Kind
        public var summary: String
    }

    public static func label(forTool name: String) -> String {
        switch name {
        case "search_my_list": return "查餐厅库"
        case "check_place_details": return "查看详情"
        case "find_similar_places": return "找相似的店"
        case "add_to_list": return "添加到 list"
        default: return name
        }
    }

    public static func summarize(toolName: String, content: String?) -> Result {
        guard let content, !content.isEmpty else { return Result(kind: .pending, summary: "查询中...") }
        guard let json = BiteJSON.parse(content) else { return Result(kind: .error, summary: "返回不是合法 JSON") }
        guard let o = json.objectValue else { return Result(kind: .error, summary: "返回格式异常") }
        if let err = o["error"]?.stringValue { return Result(kind: .error, summary: err) }
        switch toolName {
        case "search_my_list":
            let count = o["count"]?.intValue ?? 0
            if count == 0 {
                let note = o["note"]?.stringValue.map { "（\($0)）" } ?? ""
                return Result(kind: .ok, summary: "找到 0 家\(note)")
            }
            return Result(kind: .ok, summary: "找到 \(count) 家")
        case "check_place_details":
            let name = o["name"]?.stringValue ?? ""
            return Result(kind: .ok, summary: name.isEmpty ? "已查看" : "«\(name)»")
        case "find_similar_places":
            let n = o["candidates"]?.arrayValue?.count ?? 0
            let ref = o["reference"]?.stringValue ?? ""
            if n == 0 {
                let note = o["note"]?.stringValue.map { "（\($0)）" } ?? ""
                return Result(kind: .ok, summary: "没找到相似的\(note)")
            }
            return Result(kind: .ok, summary: ref.isEmpty ? "找到 \(n) 家" : "像 «\(ref)» 的找到 \(n) 家")
        case "add_to_list":
            let name = o["name"]?.stringValue ?? ""
            return Result(kind: .ok, summary: name.isEmpty ? "已添加" : "已添加 «\(name)»")
        default:
            return Result(kind: .ok, summary: "完成")
        }
    }

    public static func prettyJson(_ raw: String) -> String {
        BiteJSON.parse(raw)?.prettyPrinted ?? raw
    }
}
