import Foundation
import BiteCore

/// /api/mobile/* 和 /api/chat 的客户端。所有请求带 `Authorization: Bearer <supabase access_token>`。
/// 只有需要**服务端密钥或副作用**的操作走这里（AI 抽取 / 小红书抓取 / Google / 推送 / 邮件 / 加密的 LLM 设置）；
/// 读和普通写都直连 Supabase（见 Repositories.swift）。
final class BiteAPI: @unchecked Sendable {
    let baseURL: URL
    private let tokenProvider: @Sendable () async throws -> String
    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(baseURL: URL, tokenProvider: @escaping @Sendable () async throws -> String) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 60
        cfg.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: cfg)
    }

    // MARK: - 底层

    private func makeRequest(_ method: String, _ path: String, query: [URLQueryItem] = [], body: (any Encodable)? = nil) async throws -> URLRequest {
        guard var comps = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { throw BiteAPIError.notConfigured }
        comps.path = path
        comps.queryItems = query.isEmpty ? nil : query
        guard let url = comps.url else { throw BiteAPIError.notConfigured }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let token: String
        do { token = try await tokenProvider() } catch { throw BiteAPIError.unauthenticated }
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }
        return req
    }

    private func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw BiteAPIError.transport((error as NSError).localizedDescription)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? decoder.decode(APIErrorBody.self, from: data))?.error
                ?? String(data: data, encoding: .utf8).flatMap { $0.isEmpty ? nil : $0 }
                ?? "服务器错误（\(status)）"
            throw BiteAPIError.server(message, status)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw BiteAPIError.decoding("\(error)")
        }
    }

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await send(try await makeRequest("GET", path, query: query))
    }

    func post<T: Decodable>(_ path: String, body: any Encodable) async throws -> T {
        try await send(try await makeRequest("POST", path, body: body))
    }

    func postEmpty<T: Decodable>(_ path: String) async throws -> T {
        try await send(try await makeRequest("POST", path))
    }

    func delete<T: Decodable>(_ path: String, body: any Encodable) async throws -> T {
        try await send(try await makeRequest("DELETE", path, body: body))
    }

    // MARK: - 智能添加

    func extract(_ req: ExtractRequest) async throws -> ExtractResponse {
        try await post("/api/mobile/quick-add/extract", body: req)
    }

    func save(_ req: SaveRequest) async throws -> SaveResponse {
        try await post("/api/mobile/quick-add/save", body: req)
    }

    // MARK: - 店铺

    func createPlace(_ req: CreatePlaceRequest) async throws -> CreatePlaceResponse {
        try await post("/api/mobile/places", body: req)
    }

    func autocomplete(input: String, origin: LatLng?, session: String) async throws -> [PlaceSuggestion] {
        var q = [URLQueryItem(name: "input", value: input), URLQueryItem(name: "session", value: session)]
        if let o = origin {
            q.append(URLQueryItem(name: "lat", value: String(o.lat)))
            q.append(URLQueryItem(name: "lng", value: String(o.lng)))
        }
        let r: AutocompleteResponse = try await get("/api/mobile/places/autocomplete", query: q)
        return r.suggestions
    }

    func placeDetails(placeId: String, session: String) async throws -> PlaceDetailsResponse {
        try await get("/api/mobile/places/details", query: [
            URLQueryItem(name: "placeId", value: placeId), URLQueryItem(name: "session", value: session),
        ])
    }

    func opening(placeId: String) async throws -> OpeningInfo? {
        let r: OpeningResponse = try await get("/api/mobile/places/opening", query: [URLQueryItem(name: "placeId", value: placeId)])
        return r.opening
    }

    func enrichFromGoogle() async throws -> EnrichResponse {
        try await postEmpty("/api/mobile/places/enrich")
    }

    func xhsEnrich(placeId: String, postUrl: String) async throws -> XhsEnrichResponse {
        try await post("/api/mobile/places/xhs-enrich", body: ["place_id": placeId, "post_url": postUrl])
    }

    // MARK: - 留言 / 推荐 / 邀请

    func addComment(placeId: String, body: String) async throws -> CommentView {
        let r: AddCommentResponse = try await post("/api/mobile/comments", body: ["place_id": placeId, "body": body])
        return r.comment
    }

    func sendRecommendation(toEmail: String, placeId: String, message: String?) async throws -> SendRecommendationResponse {
        var body: [String: String] = ["to_email": toEmail, "place_id": placeId]
        if let m = message, !m.isEmpty { body["message"] = m }
        return try await post("/api/mobile/recommendations", body: body)
    }

    func acceptRecommendation(id: String, targetListId: String) async throws -> AcceptRecommendationResponse {
        try await post("/api/mobile/recommendations/accept", body: ["id": id, "target_list_id": targetListId])
    }

    func acceptInvite(token: String) async throws -> AcceptInviteResponse {
        try await post("/api/mobile/invites/accept", body: ["token": token])
    }

    // MARK: - 一起选

    func pickSession(listId: String) async throws -> PickSessionData {
        try await get("/api/mobile/pick", query: [URLQueryItem(name: "list_id", value: listId)])
    }

    func pickVote(sessionId: String, placeId: String, vote: Bool) async throws -> VoteResponse {
        try await post("/api/mobile/pick/vote", body: VoteBody(sessionId: sessionId, placeId: placeId, vote: vote))
    }

    func pickRestart(listId: String, sessionId: String) async throws -> PickSessionData {
        try await post("/api/mobile/pick/restart", body: ["list_id": listId, "session_id": sessionId])
    }

    // MARK: - AI 设置

    func llmSettings() async throws -> LlmSettingsResponse {
        try await get("/api/mobile/llm-settings")
    }

    func saveLlmSettings(_ req: LlmSettingsRequest) async throws {
        let _: OkBody = try await post("/api/mobile/llm-settings", body: req)
    }

    func resetLlmSettings() async throws {
        let _: OkBody = try await delete("/api/mobile/llm-settings", body: EmptyBody())
    }

    func testLlmSettings(_ req: LlmSettingsRequest) async throws {
        let _: OkBody = try await post("/api/mobile/llm-settings/test", body: req)
    }

    // MARK: - 推送

    func registerPush(token: String, environment: String) async throws {
        let _: OkBody = try await post("/api/mobile/push", body: ["token": token, "environment": environment])
    }

    func unregisterPush(token: String) async throws {
        let _: OkBody = try await delete("/api/mobile/push", body: ["token": token])
    }

    // MARK: - 聊天（SSE）

    /// POST /api/chat，把 SSE 事件流成 AsyncThrowingStream。取消 Task 即中断上游生成。
    func chatStream(_ req: ChatRequest) -> AsyncThrowingStream<ChatEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try await makeRequest("POST", "/api/chat", body: req)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let (bytes, response) = try await session.bytes(for: request)
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    if status != 200 {
                        var buf = Data()
                        for try await b in bytes { buf.append(b); if buf.count > 4096 { break } }
                        let text = String(data: buf, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        throw BiteAPIError.server(text.isEmpty ? "AI 调用失败（\(status)）" : text, status)
                    }
                    // 自己按 \n 切行，保留空行（SSE 靠空行分隔事件；AsyncLineSequence 不保证保留空行）
                    var acc = SSELineAccumulator()
                    var line = Data()
                    for try await byte in bytes {
                        if Task.isCancelled { break }
                        if byte == 0x0A {
                            let s = String(data: line, encoding: .utf8) ?? ""
                            line.removeAll(keepingCapacity: true)
                            if let payload = acc.consume(line: s), let ev = ChatEvent.decode(payload: payload) {
                                continuation.yield(ev)
                            }
                        } else {
                            line.append(byte)
                        }
                    }
                    if !line.isEmpty, let s = String(data: line, encoding: .utf8), let payload = acc.consume(line: s),
                       let ev = ChatEvent.decode(payload: payload) {
                        continuation.yield(ev)
                    }
                    if let payload = acc.flush(), let ev = ChatEvent.decode(payload: payload) {
                        continuation.yield(ev)
                    }
                    continuation.finish()
                } catch {
                    if error is CancellationError { continuation.finish() } else { continuation.finish(throwing: error) }
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

// MARK: - 辅助类型

enum BiteAPIError: LocalizedError {
    case notConfigured
    case unauthenticated
    case transport(String)
    case server(String, Int)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "App 还没配置服务器地址（见 ios/README.md）"
        case .unauthenticated: return "未登录或登录已过期"
        case .transport(let m): return "网络错误：\(m)"
        case .server(let m, _): return m
        case .decoding(let m): return "响应解析失败：\(m)"
        }
    }

    var statusCode: Int? { if case .server(_, let s) = self { return s }; return nil }
}

struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init(_ value: any Encodable) { encodeFn = value.encode }
    func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}

struct OkBody: Decodable { var ok: Bool? }
struct EmptyBody: Encodable {}

struct VoteBody: Encodable {
    var sessionId: String
    var placeId: String
    var vote: Bool
    enum CodingKeys: String, CodingKey { case vote; case sessionId = "session_id"; case placeId = "place_id" }
}

struct AcceptRecommendationResponse: Decodable {
    var placeId: String
    var listId: String
    var merged: Bool
    enum CodingKeys: String, CodingKey { case merged; case placeId = "place_id"; case listId = "list_id" }
}
