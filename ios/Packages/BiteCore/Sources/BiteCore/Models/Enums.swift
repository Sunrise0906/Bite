import Foundation

// 与 bite/sql/0001 的 Postgres enum 一一对应。
// 解码时遇到不认识的值一律回落到默认值而不是抛错 —— 服务端加了新枚举值时
// 老版本 App 顶多显示得不精确，不能整页崩掉。

public enum PlaceStatus: String, Codable, CaseIterable, Sendable {
    case wantToGo = "want_to_go"
    case visited
    case archived

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PlaceStatus(rawValue: raw) ?? .wantToGo
    }

    public var label: String {
        switch self {
        case .wantToGo: return "想去"
        case .visited: return "去过"
        case .archived: return "归档"
        }
    }

    /// 表单里的长写法（编辑 / 确认页）
    public var formLabel: String {
        switch self {
        case .wantToGo: return "想去"
        case .visited: return "已去过"
        case .archived: return "归档"
        }
    }

    /// 清单页分组顺序：想去 → 去过 → 归档
    public static let displayOrder: [PlaceStatus] = [.wantToGo, .visited, .archived]
}

public enum PlacePrice: String, Codable, CaseIterable, Sendable {
    case one = "$"
    case two = "$$"
    case three = "$$$"
    case four = "$$$$"

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard let v = PlacePrice(rawValue: raw) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "unknown price \(raw)"))
        }
        self = v
    }

    /// 「$ · <$15」这种带区间的标签（与 web 的 PRICE_LABEL 一致）
    public var rangeLabel: String {
        switch self {
        case .one: return "$ · <$15"
        case .two: return "$$ · $15-30"
        case .three: return "$$$ · $30-60"
        case .four: return "$$$$ · >$60"
        }
    }
}

public enum PlaceSource: String, Codable, Sendable {
    case manual
    case xhs
    case aiExtract = "ai_extract"
    case googlePlaces = "google_places"
    case yelp

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PlaceSource(rawValue: raw) ?? .manual
    }

    public var label: String {
        switch self {
        case .xhs: return "小红书"
        case .googlePlaces: return "Google"
        case .aiExtract: return "AI 提取"
        case .yelp: return "Yelp"
        case .manual: return "手动添加"
        }
    }
}

public enum VisitSentiment: String, Codable, CaseIterable, Sendable {
    case willReturn = "will_return"
    case okay
    case wontReturn = "wont_return"

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = VisitSentiment(rawValue: raw) ?? .okay
    }

    public var label: String {
        switch self {
        case .willReturn: return "会再来"
        case .okay: return "还行"
        case .wontReturn: return "不会再来"
        }
    }
}

public enum RecommendationStatus: String, Codable, Sendable {
    case pending, accepted, declined

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = RecommendationStatus(rawValue: raw) ?? .pending
    }

    public var label: String {
        switch self {
        case .pending: return "待处理"
        case .accepted: return "已接受"
        case .declined: return "已拒绝"
        }
    }
}

public enum ListMemberRole: String, Codable, Sendable {
    case coOwner = "co_owner"
    case viewer

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ListMemberRole(rawValue: raw) ?? .viewer
    }

    public var label: String {
        switch self {
        case .coOwner: return "共同所有者"
        case .viewer: return "查看者"
        }
    }
}

/// 清单领域（sql/0016）：吃 / 喝 / 玩 / 其他
public enum ListCategory: String, Codable, CaseIterable, Sendable {
    case food, drink, activity, other

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ListCategory(rawValue: raw) ?? .food
    }

    public var label: String {
        switch self {
        case .food: return "吃"
        case .drink: return "喝"
        case .activity: return "玩"
        case .other: return "其他"
        }
    }
}

/// LLM provider（与 bite/src/lib/llm/types.ts 的 ProviderId 一致）
public enum ProviderId: String, Codable, CaseIterable, Sendable {
    case gemini, anthropic, openai, deepseek, qwen

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ProviderId(rawValue: raw) ?? .gemini
    }

    public var label: String {
        switch self {
        case .gemini: return "Google Gemini"
        case .anthropic: return "Anthropic Claude"
        case .openai: return "OpenAI GPT"
        case .deepseek: return "DeepSeek"
        case .qwen: return "通义千问 Qwen"
        }
    }

    /// 是否真免费（默认 key 由 app 提供时不向用户收费），影响设置页提示
    public var isFreeTier: Bool {
        switch self {
        case .gemini, .qwen: return true
        case .anthropic, .openai, .deepseek: return false
        }
    }

    public static let displayOrder: [ProviderId] = [.gemini, .anthropic, .openai, .deepseek, .qwen]
}
