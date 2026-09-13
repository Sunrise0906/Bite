import Foundation

/// 轻量 JSON 值。两个用途：
///   1. 给 Supabase 的 update / insert 传「带显式 null」的字段（Swift 的 Optional 默认会
///      被 JSONEncoder 直接省略，清空一个字段就写不进 null）
///   2. 解 AI 工具调用的任意 input / SSE 事件里的任意 JSON
/// 不用 Supabase SDK 自带的 JSONValue，是为了让 BiteCore 保持零依赖、能在 macOS 上单测。
public enum BiteJSON: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([BiteJSON])
    case object([String: BiteJSON])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let i = try? c.decode(Int.self) { self = .int(i); return }
        if let d = try? c.decode(Double.self) { self = .double(d); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([BiteJSON].self) { self = .array(a); return }
        if let o = try? c.decode([String: BiteJSON].self) { self = .object(o); return }
        throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "unsupported JSON"))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .int(let i): try c.encode(i)
        case .double(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    // ---- 便捷访问 ----
    public var stringValue: String? { if case .string(let s) = self { return s }; return nil }
    public var intValue: Int? {
        switch self {
        case .int(let i): return i
        case .double(let d): return Int(d)
        default: return nil
        }
    }
    public var doubleValue: Double? {
        switch self {
        case .int(let i): return Double(i)
        case .double(let d): return d
        default: return nil
        }
    }
    public var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
    public var arrayValue: [BiteJSON]? { if case .array(let a) = self { return a }; return nil }
    public var objectValue: [String: BiteJSON]? { if case .object(let o) = self { return o }; return nil }
    public var isNull: Bool { if case .null = self { return true }; return false }

    public subscript(key: String) -> BiteJSON? { objectValue?[key] }

    /// 缩进好的文本（聊天里工具卡片的「参数 / 结果」面板用）
    public var prettyPrinted: String {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        guard let data = try? enc.encode(self), let s = String(data: data, encoding: .utf8) else { return "" }
        return s
    }

    /// 把 Optional<String> 变成 .string / .null（更新时清空字段要显式 null）
    public static func from(_ s: String?) -> BiteJSON { s.map { .string($0) } ?? .null }
    public static func from(_ i: Int?) -> BiteJSON { i.map { .int($0) } ?? .null }
    public static func from(_ d: Double?) -> BiteJSON { d.map { .double($0) } ?? .null }
    public static func strings(_ xs: [String]) -> BiteJSON { .array(xs.map { .string($0) }) }
}

extension BiteJSON: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByBooleanLiteral,
    ExpressibleByFloatLiteral, ExpressibleByNilLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
    public init(integerLiteral value: Int) { self = .int(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(floatLiteral value: Double) { self = .double(value) }
    public init(nilLiteral: ()) { self = .null }
    public init(arrayLiteral elements: BiteJSON...) { self = .array(elements) }
    public init(dictionaryLiteral elements: (String, BiteJSON)...) {
        self = .object(Dictionary(elements, uniquingKeysWith: { _, b in b }))
    }
}

/// 解任意 JSON 文本（工具结果是 JSON 字符串）
public extension BiteJSON {
    static func parse(_ text: String) -> BiteJSON? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(BiteJSON.self, from: data)
    }
}
