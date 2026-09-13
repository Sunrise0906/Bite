import Foundation

/// 数组列（cuisine / tags / photo_urls / reasons…）缺失或为 null 时解成空数组，
/// 不让一个 partial select 或脏 jsonb 把整个模型解码搞崩。
@propertyWrapper
public struct DefaultEmpty<T: Codable & RangeReplaceableCollection>: Codable {
    public var wrappedValue: T

    public init(wrappedValue: T) { self.wrappedValue = wrappedValue }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            wrappedValue = T()
        } else {
            wrappedValue = (try? container.decode(T.self)) ?? T()
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

extension DefaultEmpty: Equatable where T: Equatable {}
extension DefaultEmpty: Hashable where T: Hashable {}
extension DefaultEmpty: Sendable where T: Sendable {}

public extension KeyedDecodingContainer {
    func decode<T>(_ type: DefaultEmpty<T>.Type, forKey key: Key) throws -> DefaultEmpty<T> {
        try decodeIfPresent(type, forKey: key) ?? DefaultEmpty(wrappedValue: T())
    }
}

/// Postgres timestamptz 文本（"2026-08-10T12:34:56.789+00:00" / 无小数秒 / Z 结尾）→ Date。
/// 模型里的时间统一存原始字符串，需要时再解析 —— 避免依赖某个特定 JSONDecoder 的日期策略。
public enum BiteDate {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let dateOnly: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    public static func parse(_ raw: String?) -> Date? {
        guard var s = raw?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
        // Postgres 会给 "+00:00"，ISO8601DateFormatter 也吃；但 "2026-08-10 12:34:56+00" 这种
        // 带空格的老格式要先规整
        if s.count > 10, s[s.index(s.startIndex, offsetBy: 10)] == " " {
            s.replaceSubrange(s.index(s.startIndex, offsetBy: 10)...s.index(s.startIndex, offsetBy: 10), with: "T")
        }
        // "…+00" 这种只有小时的时区（老格式）补成 "+00:00"；纯日期 "2026-08-10" 不能误伤
        if s.count > 16, s.range(of: #"T.*[+-]\d{2}$"#, options: .regularExpression) != nil {
            s += ":00"
        }
        return withFraction.date(from: s) ?? plain.date(from: s) ?? dateOnly.date(from: s)
    }

    /// 生成服务端能吃的 ISO 串（UTC，带小数秒）
    public static func string(_ date: Date) -> String {
        withFraction.string(from: date)
    }

    /// yyyy-MM-dd（本地时区），给日期选择器 / 表单
    public static func dayString(_ date: Date, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
