import Foundation

// /api/mobile/* 的请求 / 响应形状。字段名与 bite/src/app/api/mobile/**/route.ts 一一对应。

/// 服务端统一的错误体 { error }
public struct APIErrorBody: Decodable, Sendable {
    public var error: String
}

// ---- 智能添加 ----

/// AI 抽取出的一家店（bite/src/lib/llm/extract-place.ts 的 ExtractedPlace）
public struct ExtractedPlace: Codable, Hashable, Sendable, Identifiable {
    public var name: String
    public var address: String
    @DefaultEmpty public var cuisine: [String]
    public var priceRange: PlacePrice?
    public var status: PlaceStatus?
    @DefaultEmpty public var occasions: [String]
    public var recommendedBy: String?
    @DefaultEmpty public var tags: [String]
    public var reason: String?
    @DefaultEmpty public var dishes: [String]
    public var confidence: String
    public var notes: String?
    public var photoIndices: [Int]?

    public var id: String { name + "|" + address }

    enum CodingKeys: String, CodingKey {
        case name, address, cuisine, status, occasions, tags, reason, dishes, confidence, notes
        case priceRange = "price_range"
        case recommendedBy = "recommended_by"
        case photoIndices = "photo_indices"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = (try? c.decode(String.self, forKey: .name)) ?? "（未知）"
        address = (try? c.decode(String.self, forKey: .address)) ?? ""
        _cuisine = try c.decode(DefaultEmpty<[String]>.self, forKey: .cuisine)
        priceRange = try? c.decodeIfPresent(PlacePrice.self, forKey: .priceRange)
        status = try? c.decodeIfPresent(PlaceStatus.self, forKey: .status)
        _occasions = try c.decode(DefaultEmpty<[String]>.self, forKey: .occasions)
        recommendedBy = try c.decodeIfPresent(String.self, forKey: .recommendedBy)
        _tags = try c.decode(DefaultEmpty<[String]>.self, forKey: .tags)
        reason = try c.decodeIfPresent(String.self, forKey: .reason)
        _dishes = try c.decode(DefaultEmpty<[String]>.self, forKey: .dishes)
        confidence = (try? c.decode(String.self, forKey: .confidence)) ?? "medium"
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        photoIndices = try? c.decodeIfPresent([Int].self, forKey: .photoIndices)
    }

    public init(name: String, address: String, cuisine: [String], priceRange: PlacePrice? = nil, status: PlaceStatus? = nil,
                occasions: [String] = [], recommendedBy: String? = nil, tags: [String] = [], reason: String? = nil,
                dishes: [String] = [], confidence: String = "high", notes: String? = nil, photoIndices: [Int]? = nil) {
        self.name = name; self.address = address; self._cuisine = DefaultEmpty(wrappedValue: cuisine)
        self.priceRange = priceRange; self.status = status; self._occasions = DefaultEmpty(wrappedValue: occasions)
        self.recommendedBy = recommendedBy; self._tags = DefaultEmpty(wrappedValue: tags); self.reason = reason
        self._dishes = DefaultEmpty(wrappedValue: dishes); self.confidence = confidence; self.notes = notes; self.photoIndices = photoIndices
    }

    public var isUnknownName: Bool {
        let n = name.trimmingCharacters(in: .whitespaces)
        return n.isEmpty || n == "（未知）" || n == "(未知)"
    }

    /// 「高 / 中 / 低」
    public var confidenceLabel: String {
        switch confidence {
        case "high": return "高"
        case "low": return "低"
        default: return "中"
        }
    }

    /// 合集帖：按 AI 标注的 photo_indices 给这家店挑图；没标 → 全部图
    public func pickPhotos(from all: [String]) -> [String] {
        guard let idx = photoIndices, !idx.isEmpty, !all.isEmpty else { return all }
        let picked = idx.filter { $0 >= 0 && $0 < all.count }.map { all[$0] }
        return picked.isEmpty ? all : picked
    }
}

/// POST /api/mobile/quick-add/extract 的响应
public struct ExtractResponse: Decodable, Sendable {
    public var mode: String
    public var places: [ExtractedPlace]
    public var source: String
    public var sourceUrl: String?
    public var scrapeWarning: String?
    @DefaultEmpty public var photoUrls: [String]
    public var targetListId: String?

    enum CodingKeys: String, CodingKey {
        case mode, places, source
        case sourceUrl = "source_url"
        case scrapeWarning = "scrape_warning"
        case photoUrls = "photo_urls"
        case targetListId = "target_list_id"
    }

    public var isMulti: Bool { mode == "multi" || places.count > 1 }
}

/// POST /api/mobile/quick-add/extract 的请求
public struct ExtractRequest: Encodable, Sendable {
    public struct Image: Encodable, Sendable {
        public var base64: String
        public var mimeType: String
        public var name: String?
        enum CodingKeys: String, CodingKey { case base64, name; case mimeType = "mime_type" }
        public init(base64: String, mimeType: String, name: String? = nil) { self.base64 = base64; self.mimeType = mimeType; self.name = name }
    }
    public var text: String?
    public var image: Image?
    public var hint: String?
    public var targetListId: String?

    enum CodingKeys: String, CodingKey { case text, image, hint; case targetListId = "target_list_id" }

    public init(text: String? = nil, image: Image? = nil, hint: String? = nil, targetListId: String? = nil) {
        self.text = text; self.image = image; self.hint = hint; self.targetListId = targetListId
    }
}

/// 确认页编辑后的候选（POST /api/mobile/quick-add/save 的 candidates[i]）
public struct CandidateInput: Encodable, Sendable, Hashable {
    public var name: String
    public var address: String
    public var cuisine: [String]
    public var priceRange: String?
    public var status: String
    public var occasions: [String]
    public var tags: [String]
    public var recommendedBy: String?
    public var reason: String?
    public var notes: String?
    public var dishes: [String]
    public var photoUrls: [String]
    public var source: String
    public var sourceUrl: String?
    public var googlePlaceId: String?
    public var lat: Double?
    public var lng: Double?

    enum CodingKeys: String, CodingKey {
        case name, address, cuisine, status, occasions, tags, reason, notes, dishes, source, lat, lng
        case priceRange = "price_range"
        case recommendedBy = "recommended_by"
        case photoUrls = "photo_urls"
        case sourceUrl = "source_url"
        case googlePlaceId = "google_place_id"
    }

    public init(name: String, address: String, cuisine: [String], priceRange: String? = nil, status: String = "want_to_go",
                occasions: [String] = [], tags: [String] = [], recommendedBy: String? = nil, reason: String? = nil,
                notes: String? = nil, dishes: [String] = [], photoUrls: [String] = [], source: String = "manual",
                sourceUrl: String? = nil, googlePlaceId: String? = nil, lat: Double? = nil, lng: Double? = nil) {
        self.name = name; self.address = address; self.cuisine = cuisine; self.priceRange = priceRange; self.status = status
        self.occasions = occasions; self.tags = tags; self.recommendedBy = recommendedBy; self.reason = reason; self.notes = notes
        self.dishes = dishes; self.photoUrls = photoUrls; self.source = source; self.sourceUrl = sourceUrl
        self.googlePlaceId = googlePlaceId; self.lat = lat; self.lng = lng
    }
}

public struct SaveRequest: Encodable, Sendable {
    public var listId: String
    public var overrideMyReason: Bool
    public var candidates: [CandidateInput]
    enum CodingKeys: String, CodingKey { case candidates; case listId = "list_id"; case overrideMyReason = "override_my_reason" }
    public init(listId: String, overrideMyReason: Bool, candidates: [CandidateInput]) {
        self.listId = listId; self.overrideMyReason = overrideMyReason; self.candidates = candidates
    }
}

public struct SaveResponse: Decodable, Sendable {
    public var inserted: Int
    public var updated: Int
}

// ---- 店铺 ----

public struct CreatePlaceRequest: Encodable, Sendable {
    public var listId: String
    public var name: String
    public var address: String
    public var cuisine: [String]
    public var priceRange: String?
    public var status: String
    public var occasions: [String]
    public var tags: [String]
    public var recommendedBy: String?
    public var reason: String?
    public var notes: String?
    public var photoUrls: [String]

    enum CodingKeys: String, CodingKey {
        case name, address, cuisine, status, occasions, tags, reason, notes
        case listId = "list_id"
        case priceRange = "price_range"
        case recommendedBy = "recommended_by"
        case photoUrls = "photo_urls"
    }

    public init(listId: String, name: String, address: String, cuisine: [String], priceRange: String?, status: String,
                occasions: [String], tags: [String], recommendedBy: String?, reason: String?, notes: String?, photoUrls: [String]) {
        self.listId = listId; self.name = name; self.address = address; self.cuisine = cuisine; self.priceRange = priceRange
        self.status = status; self.occasions = occasions; self.tags = tags; self.recommendedBy = recommendedBy
        self.reason = reason; self.notes = notes; self.photoUrls = photoUrls
    }
}

public struct CreatePlaceResponse: Decodable, Sendable { public var id: String }

public struct PlaceSuggestion: Decodable, Identifiable, Hashable, Sendable {
    public var placeId: String
    public var mainText: String
    public var secondaryText: String
    public var distanceMeters: Double?
    public var id: String { placeId }
    enum CodingKeys: String, CodingKey {
        case placeId = "place_id"
        case mainText = "main_text"
        case secondaryText = "secondary_text"
        case distanceMeters = "distance_meters"
    }
}

public struct AutocompleteResponse: Decodable, Sendable {
    public var suggestions: [PlaceSuggestion]
}

public struct PlaceDetailsResponse: Decodable, Sendable {
    public var placeId: String
    public var name: String
    public var address: String
    public var lat: Double?
    public var lng: Double?
    @DefaultEmpty public var cuisine: [String]
    public var websiteUri: String?
    enum CodingKeys: String, CodingKey {
        case name, address, lat, lng, cuisine
        case placeId = "place_id"
        case websiteUri = "website_uri"
    }
}

public struct OpeningInfo: Decodable, Hashable, Sendable {
    public var openNow: Bool?
    public var today: String?
    enum CodingKeys: String, CodingKey { case today; case openNow = "open_now" }
}

public struct OpeningResponse: Decodable, Sendable {
    public var opening: OpeningInfo?
}

public struct EnrichResponse: Decodable, Sendable {
    public var enriched: Int
    public var tried: Int
    public var healed: Int
}

public struct XhsEnrichResponse: Decodable, Sendable {
    public var addedDishes: Int
    public var addedPhotos: Int
    public var noteAppended: Bool
    enum CodingKeys: String, CodingKey {
        case addedDishes = "added_dishes"
        case addedPhotos = "added_photos"
        case noteAppended = "note_appended"
    }
}

// ---- 留言 / 推荐 / 邀请 ----

public struct CommentView: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var userId: String
    public var author: String
    public var body: String
    public var createdAt: String
    public var editable: Bool
    enum CodingKeys: String, CodingKey {
        case id, author, body, editable
        case userId = "user_id"
        case createdAt = "created_at"
    }
    public init(id: String, userId: String, author: String, body: String, createdAt: String, editable: Bool) {
        self.id = id; self.userId = userId; self.author = author; self.body = body; self.createdAt = createdAt; self.editable = editable
    }
}

public struct AddCommentResponse: Decodable, Sendable { public var comment: CommentView }

public struct SendRecommendationResponse: Decodable, Sendable {
    public var recipientEmail: String
    enum CodingKeys: String, CodingKey { case recipientEmail = "recipient_email" }
}

public struct AcceptInviteResponse: Decodable, Sendable {
    public var listId: String
    enum CodingKeys: String, CodingKey { case listId = "list_id" }
}

// ---- 一起选 ----

public struct PickCard: Decodable, Identifiable, Hashable, Sendable {
    public var placeId: String
    public var name: String
    @DefaultEmpty public var cuisine: [String]
    public var priceRange: String?
    public var photo: String?
    public var reason: String?
    public var googleRating: Double?
    public var id: String { placeId }
    enum CodingKeys: String, CodingKey {
        case name, cuisine, photo, reason
        case placeId = "place_id"
        case priceRange = "price_range"
        case googleRating = "google_rating"
    }
}

public struct PickSessionData: Decodable, Sendable {
    public var sessionId: String
    public var listId: String
    public var listName: String
    public var status: String
    public var matchedPlaceId: String?
    public var cards: [PickCard]
    public var myVotes: Int
    @DefaultEmpty public var myLikes: [String]
    public var memberCount: Int
    enum CodingKeys: String, CodingKey {
        case status, cards
        case sessionId = "session_id"
        case listId = "list_id"
        case listName = "list_name"
        case matchedPlaceId = "matched_place_id"
        case myVotes = "my_votes"
        case myLikes = "my_likes"
        case memberCount = "member_count"
    }
}

public struct PickMatched: Decodable, Hashable, Sendable {
    public var placeId: String
    public var name: String
    enum CodingKeys: String, CodingKey { case name; case placeId = "place_id" }
    public init(placeId: String, name: String) { self.placeId = placeId; self.name = name }
}

public struct VoteResponse: Decodable, Sendable {
    public var matched: PickMatched?
}

// ---- AI 设置 ----

public struct LlmSettingsResponse: Decodable, Sendable {
    public var settings: LlmSettingsView?
    public var appKeyAvailable: [String: Bool]
    public var usedToday: Int
    public var quota: Int
    public var presets: [String: ProviderPreset]

    public struct ProviderPreset: Decodable, Hashable, Sendable {
        public var baseUrl: String
        public var chatModel: String
        public var extractModel: String
        enum CodingKeys: String, CodingKey {
            case baseUrl = "base_url"
            case chatModel = "chat_model"
            case extractModel = "extract_model"
        }
    }

    enum CodingKeys: String, CodingKey {
        case settings, quota, presets
        case appKeyAvailable = "app_key_available"
        case usedToday = "used_today"
    }
}

public struct LlmSettingsRequest: Encodable, Sendable {
    public var provider: String
    public var apiKey: String?
    public var clearApiKey: Bool
    public var baseUrl: String?
    public var chatModel: String?
    public var extractModel: String?
    enum CodingKeys: String, CodingKey {
        case provider
        case apiKey = "api_key"
        case clearApiKey = "clear_api_key"
        case baseUrl = "base_url"
        case chatModel = "chat_model"
        case extractModel = "extract_model"
    }
    public init(provider: String, apiKey: String?, clearApiKey: Bool, baseUrl: String?, chatModel: String?, extractModel: String?) {
        self.provider = provider; self.apiKey = apiKey; self.clearApiKey = clearApiKey
        self.baseUrl = baseUrl; self.chatModel = chatModel; self.extractModel = extractModel
    }
}

// ---- 聊天请求体 ----

public struct ChatRequest: Encodable, Sendable {
    public var conversationId: String?
    public var message: String?
    public var regenerate: Bool?
    public var listId: String?
    enum CodingKeys: String, CodingKey {
        case message, regenerate
        case conversationId = "conversation_id"
        case listId = "list_id"
    }
    public init(conversationId: String?, message: String?, regenerate: Bool? = nil, listId: String? = nil) {
        self.conversationId = conversationId; self.message = message; self.regenerate = regenerate; self.listId = listId
    }
}
