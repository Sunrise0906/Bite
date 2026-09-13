import Foundation

// 领域模型，与 bite/src/lib/db/types.ts 一一对应。
// id 一律 String（uuid 文本），时间一律原始 ISO 串（用 BiteDate.parse 转 Date）。

public struct Profile: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var email: String?
    public var name: String?
    public var avatarUrl: String?
    public var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, email, name
        case avatarUrl = "avatar_url"
        case createdAt = "created_at"
    }

    public init(id: String, email: String?, name: String?, avatarUrl: String?, createdAt: String? = nil) {
        self.id = id; self.email = email; self.name = name; self.avatarUrl = avatarUrl; self.createdAt = createdAt
    }

    /// 显示名：昵称 → 邮箱前缀 → 「朋友」（与 web 的 fetchDisplayNames 兜底一致）
    public var displayName: String {
        if let n = name?.trimmingCharacters(in: .whitespaces), !n.isEmpty { return n }
        if let e = email, let prefix = e.split(separator: "@").first, !prefix.isEmpty { return String(prefix) }
        return "朋友"
    }

    public var initial: String { String(displayName.prefix(1)).uppercased() }
}

public struct BiteList: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var ownerId: String
    public var category: ListCategory
    public var createdAt: String?
    public var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, category
        case ownerId = "owner_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(id: String, name: String, ownerId: String, category: ListCategory = .food, createdAt: String? = nil, updatedAt: String? = nil) {
        self.id = id; self.name = name; self.ownerId = ownerId; self.category = category; self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        ownerId = try c.decode(String.self, forKey: .ownerId)
        // sql/0016 之前的库没有这一列
        category = (try? c.decodeIfPresent(ListCategory.self, forKey: .category)) ?? .food
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
    }
}

public struct ListMember: Codable, Hashable, Sendable {
    public var listId: String
    public var userId: String
    public var role: ListMemberRole
    public var invitedBy: String?
    public var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case role
        case listId = "list_id"
        case userId = "user_id"
        case invitedBy = "invited_by"
        case createdAt = "created_at"
    }
}

public struct PlaceReason: Codable, Hashable, Sendable {
    public var userId: String
    public var text: String

    enum CodingKeys: String, CodingKey {
        case text
        case userId = "user_id"
    }

    public init(userId: String, text: String) { self.userId = userId; self.text = text }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = (try? c.decode(String.self, forKey: .userId)) ?? ""
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
    }
}

public struct Place: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var listId: String
    public var name: String
    public var address: String
    @DefaultEmpty public var cuisine: [String]
    public var priceRange: PlacePrice?
    public var status: PlaceStatus
    @DefaultEmpty public var reasons: [PlaceReason]
    @DefaultEmpty public var occasions: [String]
    public var recommendedBy: String?
    @DefaultEmpty public var tags: [String]
    public var source: PlaceSource
    public var sourceUrl: String?
    public var googlePlaceId: String?
    public var googleRating: Double?
    public var googleRatingCount: Int?
    public var googleMapsUri: String?
    public var websiteUri: String?
    public var lat: Double?
    public var lng: Double?
    public var notes: String?
    @DefaultEmpty public var dishes: [String]
    @DefaultEmpty public var photoUrls: [String]
    public var createdBy: String?
    public var createdAt: String?
    public var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, address, cuisine, status, reasons, occasions, tags, source, lat, lng, notes, dishes
        case listId = "list_id"
        case priceRange = "price_range"
        case recommendedBy = "recommended_by"
        case sourceUrl = "source_url"
        case googlePlaceId = "google_place_id"
        case googleRating = "google_rating"
        case googleRatingCount = "google_rating_count"
        case googleMapsUri = "google_maps_uri"
        case websiteUri = "website_uri"
        case photoUrls = "photo_urls"
        case createdBy = "created_by"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        listId = try c.decode(String.self, forKey: .listId)
        name = try c.decode(String.self, forKey: .name)
        address = (try? c.decode(String.self, forKey: .address)) ?? ""
        _cuisine = try c.decode(DefaultEmpty<[String]>.self, forKey: .cuisine)
        // price_range 是 enum 列，脏值直接当成没填
        priceRange = try? c.decodeIfPresent(PlacePrice.self, forKey: .priceRange)
        status = (try? c.decodeIfPresent(PlaceStatus.self, forKey: .status)) ?? .wantToGo
        _reasons = try c.decode(DefaultEmpty<[PlaceReason]>.self, forKey: .reasons)
        _occasions = try c.decode(DefaultEmpty<[String]>.self, forKey: .occasions)
        recommendedBy = try c.decodeIfPresent(String.self, forKey: .recommendedBy)
        _tags = try c.decode(DefaultEmpty<[String]>.self, forKey: .tags)
        source = (try? c.decodeIfPresent(PlaceSource.self, forKey: .source)) ?? .manual
        sourceUrl = try c.decodeIfPresent(String.self, forKey: .sourceUrl)
        googlePlaceId = try c.decodeIfPresent(String.self, forKey: .googlePlaceId)
        googleRating = try? c.decodeIfPresent(Double.self, forKey: .googleRating)
        googleRatingCount = try? c.decodeIfPresent(Int.self, forKey: .googleRatingCount)
        googleMapsUri = try c.decodeIfPresent(String.self, forKey: .googleMapsUri)
        websiteUri = try c.decodeIfPresent(String.self, forKey: .websiteUri)
        lat = try? c.decodeIfPresent(Double.self, forKey: .lat)
        lng = try? c.decodeIfPresent(Double.self, forKey: .lng)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        _dishes = try c.decode(DefaultEmpty<[String]>.self, forKey: .dishes)
        _photoUrls = try c.decode(DefaultEmpty<[String]>.self, forKey: .photoUrls)
        createdBy = try c.decodeIfPresent(String.self, forKey: .createdBy)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
    }

    /// 测试 / 预览用
    public init(id: String, listId: String, name: String, address: String = "", cuisine: [String] = [], priceRange: PlacePrice? = nil,
                status: PlaceStatus = .wantToGo, reasons: [PlaceReason] = [], occasions: [String] = [], recommendedBy: String? = nil,
                tags: [String] = [], source: PlaceSource = .manual, sourceUrl: String? = nil, googlePlaceId: String? = nil,
                googleRating: Double? = nil, googleRatingCount: Int? = nil, googleMapsUri: String? = nil, websiteUri: String? = nil,
                lat: Double? = nil, lng: Double? = nil, notes: String? = nil, dishes: [String] = [], photoUrls: [String] = [],
                createdBy: String? = nil, createdAt: String? = nil, updatedAt: String? = nil) {
        self.id = id; self.listId = listId; self.name = name; self.address = address
        self._cuisine = DefaultEmpty(wrappedValue: cuisine)
        self.priceRange = priceRange; self.status = status
        self._reasons = DefaultEmpty(wrappedValue: reasons)
        self._occasions = DefaultEmpty(wrappedValue: occasions)
        self.recommendedBy = recommendedBy
        self._tags = DefaultEmpty(wrappedValue: tags)
        self.source = source; self.sourceUrl = sourceUrl; self.googlePlaceId = googlePlaceId
        self.googleRating = googleRating; self.googleRatingCount = googleRatingCount
        self.googleMapsUri = googleMapsUri; self.websiteUri = websiteUri
        self.lat = lat; self.lng = lng; self.notes = notes
        self._dishes = DefaultEmpty(wrappedValue: dishes)
        self._photoUrls = DefaultEmpty(wrappedValue: photoUrls)
        self.createdBy = createdBy; self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    /// 封面：第一张图
    public var coverUrl: String? { photoUrls.first }

    /// 「我的理由」优先，其次别人的第一条（共享清单）
    public func shownReason(for userId: String) -> PlaceReason? {
        reasons.first { $0.userId == userId && !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
            ?? reasons.first { $0.userId != userId && !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    public func myReason(for userId: String) -> PlaceReason? {
        reasons.first { $0.userId == userId && !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    public var hasCoordinates: Bool { lat != nil && lng != nil }
}

public struct VisitLog: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var placeId: String
    public var userId: String
    public var visitedAt: String
    public var sentiment: VisitSentiment
    public var starRating: Int?
    public var note: String?
    @DefaultEmpty public var photos: [String]
    public var companions: String?
    public var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, sentiment, note, photos, companions
        case placeId = "place_id"
        case userId = "user_id"
        case visitedAt = "visited_at"
        case starRating = "star_rating"
        case createdAt = "created_at"
    }

    public init(id: String, placeId: String, userId: String, visitedAt: String, sentiment: VisitSentiment, starRating: Int? = nil,
                note: String? = nil, photos: [String] = [], companions: String? = nil, createdAt: String? = nil) {
        self.id = id; self.placeId = placeId; self.userId = userId; self.visitedAt = visitedAt; self.sentiment = sentiment
        self.starRating = starRating; self.note = note; self._photos = DefaultEmpty(wrappedValue: photos)
        self.companions = companions; self.createdAt = createdAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        placeId = try c.decode(String.self, forKey: .placeId)
        userId = (try? c.decode(String.self, forKey: .userId)) ?? ""
        visitedAt = (try? c.decode(String.self, forKey: .visitedAt)) ?? ""
        sentiment = (try? c.decode(VisitSentiment.self, forKey: .sentiment)) ?? .okay
        starRating = try? c.decodeIfPresent(Int.self, forKey: .starRating)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        _photos = try c.decode(DefaultEmpty<[String]>.self, forKey: .photos)
        companions = try c.decodeIfPresent(String.self, forKey: .companions)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
    }
}

/// 推荐时快照下来的店（bite/src/lib/actions/recommendations.ts 的 SnapshottedPlace）
public struct SnapshottedPlace: Codable, Hashable, Sendable {
    public var name: String
    public var address: String
    @DefaultEmpty public var cuisine: [String]
    public var priceRange: PlacePrice?
    @DefaultEmpty public var occasions: [String]
    public var recommendedBy: String?
    @DefaultEmpty public var tags: [String]
    public var notes: String?
    public var source: String?
    public var sourceUrl: String?
    @DefaultEmpty public var photoUrls: [String]
    public var lat: Double?
    public var lng: Double?
    public var googlePlaceId: String?
    /// 发送者一句话理由
    public var message: String?
    public var fromUserId: String?

    enum CodingKeys: String, CodingKey {
        case name, address, cuisine, occasions, tags, notes, source, lat, lng, message
        case priceRange = "price_range"
        case recommendedBy = "recommended_by"
        case sourceUrl = "source_url"
        case photoUrls = "photo_urls"
        case googlePlaceId = "google_place_id"
        case fromUserId = "from_user_id"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = (try? c.decode(String.self, forKey: .name)) ?? "（未知）"
        address = (try? c.decode(String.self, forKey: .address)) ?? ""
        _cuisine = try c.decode(DefaultEmpty<[String]>.self, forKey: .cuisine)
        priceRange = try? c.decodeIfPresent(PlacePrice.self, forKey: .priceRange)
        _occasions = try c.decode(DefaultEmpty<[String]>.self, forKey: .occasions)
        recommendedBy = try c.decodeIfPresent(String.self, forKey: .recommendedBy)
        _tags = try c.decode(DefaultEmpty<[String]>.self, forKey: .tags)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        sourceUrl = try c.decodeIfPresent(String.self, forKey: .sourceUrl)
        _photoUrls = try c.decode(DefaultEmpty<[String]>.self, forKey: .photoUrls)
        lat = try? c.decodeIfPresent(Double.self, forKey: .lat)
        lng = try? c.decodeIfPresent(Double.self, forKey: .lng)
        googlePlaceId = try c.decodeIfPresent(String.self, forKey: .googlePlaceId)
        message = try c.decodeIfPresent(String.self, forKey: .message)
        fromUserId = try c.decodeIfPresent(String.self, forKey: .fromUserId)
    }
}

public struct Recommendation: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var fromUserId: String
    public var toUserId: String
    public var placeData: SnapshottedPlace
    public var status: RecommendationStatus
    public var createdAt: String
    public var resolvedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, status
        case fromUserId = "from_user_id"
        case toUserId = "to_user_id"
        case placeData = "place_data"
        case createdAt = "created_at"
        case resolvedAt = "resolved_at"
    }
}

/// place_comments 行（sql/0025）
public struct PlaceCommentRow: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var placeId: String
    public var listId: String
    public var userId: String
    public var body: String
    public var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, body
        case placeId = "place_id"
        case listId = "list_id"
        case userId = "user_id"
        case createdAt = "created_at"
    }
}

/// place_ratings 行（sql/0028）。tier 极性见 Logic/Tier.swift —— 1 最好。
public struct PlaceRatingRow: Codable, Hashable, Sendable {
    public var placeId: String
    public var userId: String
    public var tier: Int

    enum CodingKeys: String, CodingKey {
        case tier
        case placeId = "place_id"
        case userId = "user_id"
    }

    public init(placeId: String, userId: String, tier: Int) { self.placeId = placeId; self.userId = userId; self.tier = tier }
}

public struct ListInvite: Codable, Identifiable, Hashable, Sendable {
    public var token: String
    public var listId: String?
    public var role: ListMemberRole
    public var expiresAt: String
    public var usedAt: String?
    public var createdAt: String?

    public var id: String { token }

    enum CodingKeys: String, CodingKey {
        case token, role
        case listId = "list_id"
        case expiresAt = "expires_at"
        case usedAt = "used_at"
        case createdAt = "created_at"
    }

    public var isExpired: Bool {
        guard let d = BiteDate.parse(expiresAt) else { return false }
        return d < Date()
    }
}

/// get_invite_preview RPC 的返回行（sql/0011）
public struct InvitePreview: Codable, Hashable, Sendable {
    public var token: String
    public var listId: String
    public var listName: String
    public var role: ListMemberRole
    public var expiresAt: String
    public var usedAt: String?
    public var ownerId: String

    enum CodingKeys: String, CodingKey {
        case token, role
        case listId = "list_id"
        case listName = "list_name"
        case expiresAt = "expires_at"
        case usedAt = "used_at"
        case ownerId = "owner_id"
    }

    public var isExpired: Bool { (BiteDate.parse(expiresAt) ?? .distantFuture) < Date() }
    public var isUsed: Bool { usedAt != nil }
}

/// list_member_activity RPC（sql/0027）
public struct MemberActivity: Codable, Hashable, Sendable {
    public var userId: String
    public var lastSeenAt: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case lastSeenAt = "last_seen_at"
    }
}

public struct Conversation: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var userId: String?
    public var title: String?
    public var provider: ProviderId
    public var model: String?
    public var scopeListId: String?
    public var createdAt: String?
    public var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, provider, model
        case userId = "user_id"
        case scopeListId = "scope_list_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        userId = try c.decodeIfPresent(String.self, forKey: .userId)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        provider = (try? c.decodeIfPresent(ProviderId.self, forKey: .provider)) ?? .gemini
        model = try c.decodeIfPresent(String.self, forKey: .model)
        scopeListId = try c.decodeIfPresent(String.self, forKey: .scopeListId)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
    }
}

/// messages.content 里的块（与 bite/src/lib/llm/types.ts 的 LlmContentBlock 一致）
public enum LlmContentBlock: Codable, Hashable, Sendable {
    case text(String)
    case toolUse(id: String, name: String, input: BiteJSON)
    case toolResult(toolUseId: String, content: String, isError: Bool)

    enum CodingKeys: String, CodingKey {
        case type, text, id, name, input, content
        case toolUseId = "tool_use_id"
        case isError = "is_error"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = (try? c.decode(String.self, forKey: .type)) ?? "text"
        switch type {
        case "tool_use":
            self = .toolUse(
                id: (try? c.decode(String.self, forKey: .id)) ?? "",
                name: (try? c.decode(String.self, forKey: .name)) ?? "",
                input: (try? c.decode(BiteJSON.self, forKey: .input)) ?? .object([:])
            )
        case "tool_result":
            self = .toolResult(
                toolUseId: (try? c.decode(String.self, forKey: .toolUseId)) ?? "",
                content: (try? c.decode(String.self, forKey: .content)) ?? "",
                isError: (try? c.decode(Bool.self, forKey: .isError)) ?? false
            )
        default:
            self = .text((try? c.decode(String.self, forKey: .text)) ?? "")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .text(let t):
            try c.encode("text", forKey: .type)
            try c.encode(t, forKey: .text)
        case .toolUse(let id, let name, let input):
            try c.encode("tool_use", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(name, forKey: .name)
            try c.encode(input, forKey: .input)
        case .toolResult(let toolUseId, let content, let isError):
            try c.encode("tool_result", forKey: .type)
            try c.encode(toolUseId, forKey: .toolUseId)
            try c.encode(content, forKey: .content)
            if isError { try c.encode(true, forKey: .isError) }
        }
    }

    public var textValue: String? { if case .text(let t) = self { return t }; return nil }
}

public struct MessageRow: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var conversationId: String
    public var role: String
    @DefaultEmpty public var content: [LlmContentBlock]
    public var usage: BiteJSON?
    public var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, role, content, usage
        case conversationId = "conversation_id"
        case createdAt = "created_at"
    }

    public var isUser: Bool { role == "user" }
}

/// user_llm_settings（api_key 是密文，App 永远只关心「有没有」）
public struct LlmSettingsView: Codable, Hashable, Sendable {
    public var provider: ProviderId
    public var hasApiKey: Bool
    public var baseUrl: String?
    public var chatModel: String?
    public var extractModel: String?

    enum CodingKeys: String, CodingKey {
        case provider
        case hasApiKey = "has_api_key"
        case baseUrl = "base_url"
        case chatModel = "chat_model"
        case extractModel = "extract_model"
    }
}
