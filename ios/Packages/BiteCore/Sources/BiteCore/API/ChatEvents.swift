import Foundation

/// /api/chat 的 SSE 事件（bite/src/app/api/chat/route.ts 的 send(...) 那些形状）。
public enum ChatEvent: Equatable, Sendable {
    case meta(conversationId: String, isNew: Bool)
    case text(delta: String)
    case toolUseStart(id: String, name: String)
    case toolUseInputDelta(id: String, delta: String)
    case toolUseDone(id: String, name: String, input: BiteJSON)
    case toolExecuting(id: String, name: String)
    case toolResult(id: String, name: String, result: String)
    case usage(inputTokens: Int, outputTokens: Int)
    case done(reason: String)
    case error(message: String)
    case unknown(type: String)

    /// 解一条 SSE 的 data 载荷（去掉 "data: " 前缀之后的 JSON）
    public static func decode(payload: String) -> ChatEvent? {
        guard let json = BiteJSON.parse(payload), let o = json.objectValue else { return nil }
        let type = o["type"]?.stringValue ?? ""
        func s(_ k: String) -> String { o[k]?.stringValue ?? "" }
        switch type {
        case "meta":
            return .meta(conversationId: s("conversation_id"), isNew: o["is_new"]?.boolValue ?? false)
        case "text":
            return .text(delta: s("delta"))
        case "tool_use_start":
            return .toolUseStart(id: s("id"), name: s("name"))
        case "tool_use_input_delta":
            return .toolUseInputDelta(id: s("id"), delta: s("delta"))
        case "tool_use_done":
            return .toolUseDone(id: s("id"), name: s("name"), input: o["input"] ?? .object([:]))
        case "tool_executing":
            return .toolExecuting(id: s("id"), name: s("name"))
        case "tool_result":
            return .toolResult(id: s("id"), name: s("name"), result: s("result"))
        case "usage":
            return .usage(inputTokens: o["input_tokens"]?.intValue ?? 0, outputTokens: o["output_tokens"]?.intValue ?? 0)
        case "done":
            return .done(reason: s("reason"))
        case "error":
            return .error(message: s("message").isEmpty ? "AI 调用失败" : s("message"))
        default:
            return .unknown(type: type)
        }
    }
}

/// 逐行喂 SSE 文本，凑齐一个事件（空行分隔）就吐出它的 data 载荷。
/// 服务端一个事件只有一行 `data: {...}`，但按规范多行 data 要用 \n 拼接，这里照规范做。
public struct SSELineAccumulator: Sendable {
    private var dataLines: [String] = []

    public init() {}

    /// 返回 nil 表示事件还没结束
    public mutating func consume(line rawLine: String) -> String? {
        let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine
        if line.isEmpty {
            guard !dataLines.isEmpty else { return nil }
            let payload = dataLines.joined(separator: "\n")
            dataLines.removeAll()
            return payload
        }
        if line.hasPrefix(":") { return nil } // 注释 / 心跳
        if line.hasPrefix("data:") {
            var v = String(line.dropFirst(5))
            if v.hasPrefix(" ") { v.removeFirst() }
            dataLines.append(v)
        }
        // event: / id: / retry: 这里用不到
        return nil
    }

    /// 流结束时把没用空行收尾的最后一个事件吐出来
    public mutating func flush() -> String? {
        guard !dataLines.isEmpty else { return nil }
        let payload = dataLines.joined(separator: "\n")
        dataLines.removeAll()
        return payload
    }
}
