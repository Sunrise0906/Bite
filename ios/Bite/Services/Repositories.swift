import Foundation
import Supabase
import BiteCore

// 直连 Supabase 的读写（RLS 决定权限，App 不重复鉴权 —— 与 web 同一条约定）。
// ⚠️ RLS 挡掉 UPDATE / DELETE 时 Postgres 不报错、只影响 0 行，所以每个写操作都
// `.select("id")` 回读行数，0 行就抛 RepoError.noRows —— 否则 UI 会显示「已完成」而库里毫无变化。

enum RepoError: LocalizedError {
    case noRows(String)
    var errorDescription: String? { if case .noRows(let m) = self { return m }; return nil }
}

struct IdRow: Decodable { var id: String }
struct TokenRow: Decodable { var token: String }
struct PlaceIdRow: Decodable { var placeId: String; enum CodingKeys: String, CodingKey { case placeId = "place_id" } }
struct UserIdRow: Decodable { var userId: String; enum CodingKeys: String, CodingKey { case userId = "user_id" } }

struct Repos {
    let lists: ListsRepo
    let places: PlacesRepo
    let visits: VisitsRepo
    let ratings: RatingsRepo
    let comments: CommentsRepo
    let profiles: ProfilesRepo
    let recommendations: RecommendationsRepo
    let invites: InvitesRepo
    let chat: ChatRepo

    init(client: SupabaseClient) {
        lists = ListsRepo(client: client)
        places = PlacesRepo(client: client)
        visits = VisitsRepo(client: client)
        ratings = RatingsRepo(client: client)
        comments = CommentsRepo(client: client)
        profiles = ProfilesRepo(client: client)
        recommendations = RecommendationsRepo(client: client)
        invites = InvitesRepo(client: client)
        chat = ChatRepo(client: client)
    }
}

/// 当前时间的 ISO 串（gt / lt 过滤用）
private func nowISO() -> String { BiteDate.string(Date()) }

// MARK: - 清单

final class ListsRepo {
    let client: SupabaseClient
    init(client: SupabaseClient) { self.client = client }

    private let columns = "id, name, owner_id, category, created_at, updated_at"

    func fetchAll() async throws -> [BiteList] {
        try await client.from("lists").select(columns).execute().value
    }

    func fetch(id: String) async throws -> BiteList? {
        let rows: [BiteList] = try await client.from("lists").select(columns).eq("id", value: id).limit(1).execute().value
        return rows.first
    }

    func members(listIds: [String]) async throws -> [ListMember] {
        guard !listIds.isEmpty else { return [] }
        return try await client.from("list_members")
            .select("list_id, user_id, role, invited_by, created_at")
            .in("list_id", values: listIds)
            .execute().value
    }

    func members(listId: String) async throws -> [ListMember] {
        try await client.from("list_members")
            .select("list_id, user_id, role, invited_by, created_at")
            .eq("list_id", value: listId)
            .execute().value
    }

    func create(name: String, category: ListCategory, ownerId: String) async throws -> String {
        let row: IdRow = try await client.from("lists")
            .insert(["name": name, "category": category.rawValue, "owner_id": ownerId])
            .select("id").single().execute().value
        return row.id
    }

    /// owner 或 co_owner 都能改名（sql/0019）
    func rename(id: String, name: String) async throws {
        let rows: [IdRow] = try await client.from("lists").update(["name": name]).eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("重命名失败：你没有这个清单的编辑权限") }
    }

    /// 只有 owner 能删
    func delete(id: String) async throws {
        let rows: [IdRow] = try await client.from("lists").delete().eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("删除失败：只有清单所有者能删除") }
    }

    func leave(listId: String, userId: String) async throws {
        let rows: [UserIdRow] = try await client.from("list_members").delete()
            .eq("list_id", value: listId).eq("user_id", value: userId)
            .select("user_id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("你不是这个清单的成员（清单所有者不能离开自己的清单）") }
    }

    func changeRole(listId: String, userId: String, role: ListMemberRole) async throws {
        let rows: [UserIdRow] = try await client.from("list_members").update(["role": role.rawValue])
            .eq("list_id", value: listId).eq("user_id", value: userId)
            .select("user_id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("修改没有生效：只有清单所有者能改角色") }
    }

    func removeMember(listId: String, userId: String) async throws {
        let rows: [UserIdRow] = try await client.from("list_members").delete()
            .eq("list_id", value: listId).eq("user_id", value: userId)
            .select("user_id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("移除失败：这个人不在成员列表里，或你不是所有者") }
    }

    /// 同清单成员的活跃时间（sql/0027 的 RPC；last_seen_at 不再全站可读）
    func memberActivity(listId: String) async throws -> [MemberActivity] {
        try await client.rpc("list_member_activity", params: ["p_list_id": listId]).execute().value
    }

    /// 30 秒一次的「刚刚在线」心跳（best-effort）
    func heartbeat(userId: String) async {
        _ = try? await client.from("profiles").update(["last_seen_at": nowISO()]).eq("id", value: userId).execute()
    }
}

// MARK: - 店铺

struct PlaceNameRow: Decodable {
    var id: String
    var name: String
}

final class PlacesRepo {
    let client: SupabaseClient
    init(client: SupabaseClient) { self.client = client }

    func fetchForList(_ listId: String) async throws -> [Place] {
        try await client.from("places").select("*").eq("list_id", value: listId)
            .order("updated_at", ascending: false).execute().value
    }

    func fetchForLists(_ listIds: [String]) async throws -> [Place] {
        guard !listIds.isEmpty else { return [] }
        return try await client.from("places").select("*").in("list_id", values: listIds)
            .order("updated_at", ascending: false).execute().value
    }

    func fetch(id: String) async throws -> Place? {
        let rows: [Place] = try await client.from("places").select("*").eq("id", value: id).limit(1).execute().value
        return rows.first
    }

    /// 同清单里所有店的 (id, name)，分页拉（PostgREST 默认 1000 行上限）
    func nameRows(listId: String) async throws -> [PlaceNameRow] {
        var out: [PlaceNameRow] = []
        var from = 0
        let page = 1000
        while true {
            let rows: [PlaceNameRow] = try await client.from("places").select("id, name")
                .eq("list_id", value: listId).order("created_at", ascending: true)
                .range(from: from, to: from + page - 1).execute().value
            out.append(contentsOf: rows)
            if rows.count < page { break }
            from += page
        }
        return out
    }

    func updateStatus(id: String, status: PlaceStatus) async throws {
        let rows: [IdRow] = try await client.from("places").update(["status": status.rawValue])
            .eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("你没有这个清单的编辑权限") }
    }

    /// 通用更新（fields 用 BiteJSON 是为了能写显式 null）
    func update(id: String, fields: [String: BiteJSON]) async throws {
        let rows: [IdRow] = try await client.from("places").update(fields).eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("保存失败：你没有这个清单的编辑权限") }
    }

    /// 只改 / 删自己那条理由，别人的原样保留（web 的 syncOwnReason）
    func syncOwnReason(placeId: String, userId: String, text: String?) async throws {
        guard let place = try await fetch(id: placeId) else { throw RepoError.noRows("找不到这家店") }
        var next = place.reasons.filter { $0.userId != userId }
        if let t = text?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty {
            next.append(PlaceReason(userId: userId, text: t))
        }
        let encoded = next.map { BiteJSON.object(["user_id": .string($0.userId), "text": .string($0.text)]) }
        try await update(id: placeId, fields: ["reasons": .array(encoded)])
    }

    func delete(id: String) async throws {
        let rows: [IdRow] = try await client.from("places").delete().eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("删除失败：你没有这个清单的编辑权限") }
    }
}

// MARK: - 造访

final class VisitsRepo {
    let client: SupabaseClient
    init(client: SupabaseClient) { self.client = client }

    func fetch(placeId: String) async throws -> [VisitLog] {
        try await client.from("visit_logs").select("*").eq("place_id", value: placeId)
            .order("visited_at", ascending: false).execute().value
    }

    func fetch(placeIds: [String]) async throws -> [VisitLog] {
        guard !placeIds.isEmpty else { return [] }
        return try await client.from("visit_logs").select("id, place_id, user_id, visited_at, sentiment, star_rating")
            .in("place_id", values: placeIds).order("visited_at", ascending: false).execute().value
    }

    func fetchMine(userId: String, limit: Int = 1000) async throws -> [VisitLog] {
        try await client.from("visit_logs").select("id, place_id, user_id, visited_at, sentiment, star_rating")
            .eq("user_id", value: userId).order("visited_at", ascending: false).limit(limit).execute().value
    }

    func insert(_ fields: [String: BiteJSON]) async throws -> VisitLog {
        try await client.from("visit_logs").insert(fields).select("*").single().execute().value
    }

    func update(id: String, userId: String, fields: [String: BiteJSON]) async throws {
        let rows: [IdRow] = try await client.from("visit_logs").update(fields)
            .eq("id", value: id).eq("user_id", value: userId).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("未找到这条记录或无权限编辑") }
    }

    func delete(id: String, userId: String) async throws {
        let rows: [IdRow] = try await client.from("visit_logs").delete()
            .eq("id", value: id).eq("user_id", value: userId).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("未找到这条记录或无权限删除") }
    }
}

// MARK: - 快捷评价（sql/0028）

final class RatingsRepo {
    let client: SupabaseClient
    init(client: SupabaseClient) { self.client = client }

    static let missingTableMessage = "快捷评价还没启用（数据库还没跑 sql/0028）"

    /// 表还没建（42P01）时返回空，清单页照常渲染
    func fetch(placeIds: [String]) async throws -> [PlaceRatingRow] {
        guard !placeIds.isEmpty else { return [] }
        do {
            return try await client.from("place_ratings").select("place_id, user_id, tier")
                .in("place_id", values: placeIds).execute().value
        } catch {
            if Self.isMissingTable(error) { return [] }
            throw error
        }
    }

    func set(placeId: String, listId: String, userId: String, tier: PlaceTier) async throws {
        do {
            let rows: [PlaceIdRow] = try await client.from("place_ratings")
                .upsert(RatingUpsert(placeId: placeId, listId: listId, userId: userId, tier: tier.rawValue), onConflict: "place_id,user_id")
                .select("place_id").execute().value
            guard !rows.isEmpty else { throw RepoError.noRows("你没有这个清单的访问权限") }
        } catch {
            if Self.isMissingTable(error) { throw RepoError.noRows(Self.missingTableMessage) }
            throw error
        }
    }

    func clear(placeId: String, userId: String) async throws {
        do {
            _ = try await client.from("place_ratings").delete()
                .eq("place_id", value: placeId).eq("user_id", value: userId).execute()
        } catch {
            if Self.isMissingTable(error) { throw RepoError.noRows(Self.missingTableMessage) }
            throw error
        }
    }

    static func isMissingTable(_ error: Error) -> Bool {
        let text = "\(error)"
        return text.contains("42P01") || text.contains("place_ratings") && text.contains("does not exist")
    }

    private struct RatingUpsert: Encodable {
        var placeId: String; var listId: String; var userId: String; var tier: Int
        enum CodingKeys: String, CodingKey { case tier; case placeId = "place_id"; case listId = "list_id"; case userId = "user_id" }
    }
}

// MARK: - 留言（sql/0025；发留言走 API，因为要推送）

final class CommentsRepo {
    let client: SupabaseClient
    init(client: SupabaseClient) { self.client = client }

    func fetch(placeId: String) async throws -> [PlaceCommentRow] {
        do {
            return try await client.from("place_comments").select("id, place_id, list_id, user_id, body, created_at")
                .eq("place_id", value: placeId).order("created_at", ascending: true).execute().value
        } catch {
            if RatingsRepo.isMissingTable(error) || "\(error)".contains("place_comments") { return [] }
            throw error
        }
    }

    func delete(id: String) async throws {
        let rows: [IdRow] = try await client.from("place_comments").delete().eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("只能删自己的留言") }
    }
}

// MARK: - 个人资料

final class ProfilesRepo {
    let client: SupabaseClient
    init(client: SupabaseClient) { self.client = client }

    func fetch(ids: [String]) async throws -> [Profile] {
        let unique = Array(Set(ids.filter { !$0.isEmpty }))
        guard !unique.isEmpty else { return [] }
        return try await client.from("profiles").select("id, name, email, avatar_url, created_at")
            .in("id", values: unique).execute().value
    }

    func fetch(id: String) async throws -> Profile? {
        try await fetch(ids: [id]).first
    }

    func update(id: String, name: String?, avatarUrl: String?) async throws {
        let rows: [IdRow] = try await client.from("profiles")
            .update(["name": BiteJSON.from(name), "avatar_url": BiteJSON.from(avatarUrl)])
            .eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("保存失败") }
    }
}

// MARK: - 推荐收件箱（发送 / 接受走 API）

final class RecommendationsRepo {
    let client: SupabaseClient
    init(client: SupabaseClient) { self.client = client }

    func incoming(userId: String) async throws -> [Recommendation] {
        try await client.from("recommendations").select("*").eq("to_user_id", value: userId)
            .order("created_at", ascending: false).execute().value
    }

    func outgoing(userId: String) async throws -> [Recommendation] {
        try await client.from("recommendations").select("*").eq("from_user_id", value: userId)
            .order("created_at", ascending: false).execute().value
    }

    func pendingCount(userId: String) async throws -> Int {
        let r = try await client.from("recommendations").select("id", head: true, count: .exact)
            .eq("to_user_id", value: userId).eq("status", value: "pending").execute()
        return r.count ?? 0
    }

    func decline(id: String) async throws {
        let rows: [IdRow] = try await client.from("recommendations")
            .update(["status": "declined", "resolved_at": nowISO()])
            .eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("这条推荐不存在或不是发给你的") }
    }

    func withdraw(id: String) async throws {
        let rows: [IdRow] = try await client.from("recommendations").delete().eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("撤回失败：这条推荐不存在或不是你发出的") }
    }
}

// MARK: - 邀请（接受走 API）

final class InvitesRepo {
    let client: SupabaseClient
    init(client: SupabaseClient) { self.client = client }

    func active(listId: String) async throws -> [ListInvite] {
        try await client.from("list_invites").select("token, list_id, role, expires_at, used_at, created_at")
            .eq("list_id", value: listId).is("used_at", value: nil).gt("expires_at", value: nowISO())
            .order("created_at", ascending: false).execute().value
    }

    func create(listId: String, createdBy: String, role: ListMemberRole) async throws -> ListInvite {
        try await client.from("list_invites")
            .insert(["list_id": listId, "created_by": createdBy, "role": role.rawValue])
            .select("token, list_id, role, expires_at, used_at, created_at").single().execute().value
    }

    func revoke(token: String) async throws {
        let rows: [TokenRow] = try await client.from("list_invites").delete().eq("token", value: token).select("token").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("撤销失败：邀请不存在，或你不是这个清单的所有者") }
    }

    func preview(token: String) async throws -> InvitePreview? {
        let rows: [InvitePreview] = try await client.rpc("get_invite_preview", params: ["p_token": token]).execute().value
        return rows.first
    }
}

// MARK: - 聊天历史（发消息走 /api/chat）

struct UsageRow: Decodable {
    var usage: BiteJSON?
    var createdAt: String
    enum CodingKeys: String, CodingKey { case usage; case createdAt = "created_at" }
}

final class ChatRepo {
    let client: SupabaseClient
    init(client: SupabaseClient) { self.client = client }

    func conversations(userId: String, limit: Int = 50) async throws -> [Conversation] {
        try await client.from("conversations").select("*").eq("user_id", value: userId)
            .order("updated_at", ascending: false).limit(limit).execute().value
    }

    func conversation(id: String) async throws -> Conversation? {
        let rows: [Conversation] = try await client.from("conversations").select("*").eq("id", value: id).limit(1).execute().value
        return rows.first
    }

    func messages(conversationId: String) async throws -> [MessageRow] {
        try await client.from("messages").select("*").eq("conversation_id", value: conversationId)
            .order("created_at", ascending: true).execute().value
    }

    func rename(id: String, title: String) async throws {
        let rows: [IdRow] = try await client.from("conversations").update(["title": title]).eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("找不到这个会话") }
    }

    func delete(id: String) async throws {
        let rows: [IdRow] = try await client.from("conversations").delete().eq("id", value: id).select("id").execute().value
        guard !rows.isEmpty else { throw RepoError.noRows("找不到这个会话") }
    }

    /// AI 用量（RLS 限制只能拿到自己会话的消息）
    func usageRows() async throws -> [UsageRow] {
        try await client.from("messages").select("usage, created_at").eq("role", value: "assistant")
            .not("usage", operator: .is, value: "null").execute().value
    }
}
