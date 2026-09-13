import SwiftUI
import BiteCore

/// 清单详情（web 的 /lists/[id]）：店 + 造访信号 + 档位 + 成员 + 邀请
@MainActor
@Observable
final class ListDetailModel {
    var list: BiteList?
    var places: [Place] = []
    /// place.id → 签名后的封面
    var covers: [String: String] = [:]
    var visitsByPlace: [String: VisitSignal] = [:]
    var tiersByPlace: [String: [PlaceRatingRow]] = [:]
    var reasonAuthors: [String: String] = [:]
    var members: [MemberDisplay] = []
    var invites: [ListInvite] = []
    var memberRole: ListMemberRole?
    var ownerName: String?
    var isLoading = false
    var loadedOnce = false
    var error: String?
    var notFound = false

    struct MemberDisplay: Identifiable, Hashable {
        var userId: String
        var role: ListMemberRole
        var displayName: String
        var active: Bool
        var id: String { userId }
    }

    var isOwner: Bool { list.map { $0.ownerId == currentUserId } ?? false }
    var canEdit: Bool { isOwner || memberRole == .coOwner }
    private var currentUserId = ""

    func load(_ session: AppSession, listId: String) async {
        guard let uid = session.userId else { return }
        currentUserId = uid
        if !loadedOnce { isLoading = true }
        defer { isLoading = false; loadedOnce = true }
        error = nil
        do {
            async let listTask = session.repos.lists.fetch(id: listId)
            async let placesTask = session.repos.places.fetchForList(listId)
            async let membersTask = session.repos.lists.members(listId: listId)
            let (list, places, memberRows) = try await (listTask, placesTask, membersTask)
            guard let list else { notFound = true; return }
            self.list = list
            self.places = places
            memberRole = memberRows.first { $0.userId == uid }?.role

            let placeIds = places.map(\.id)
            async let visitsTask = session.repos.visits.fetch(placeIds: placeIds)
            async let tiersTask = session.repos.ratings.fetch(placeIds: placeIds)
            async let coversTask = session.photos.signedMap(for: places.compactMap(\.coverUrl))
            let (visitRows, tierRows, coverMap) = try await (visitsTask, tiersTask, coversTask)
            visitsByPlace = VisitAggregate.signals(visitRows)
            var tiers: [String: [PlaceRatingRow]] = [:]
            for r in tierRows { tiers[r.placeId, default: []].append(r) }
            tiersByPlace = tiers
            var cov: [String: String] = [:]
            for p in places { if let c = p.coverUrl { cov[p.id] = coverMap[c] ?? c } }
            covers = cov

            // 名字：理由作者 + owner + 成员
            var ids = Set<String>()
            for p in places { for r in p.reasons where r.userId != uid { ids.insert(r.userId) } }
            ids.insert(list.ownerId)
            for m in memberRows { ids.insert(m.userId) }
            let profiles = try await session.repos.profiles.fetch(ids: Array(ids))
            let nameById = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.displayName) })
            reasonAuthors = nameById
            ownerName = list.ownerId == uid ? nil : nameById[list.ownerId]

            let seen = (try? await session.repos.lists.memberActivity(listId: listId)) ?? []
            let seenMap = Dictionary(uniqueKeysWithValues: seen.map { ($0.userId, $0.lastSeenAt) })
            members = memberRows.map {
                MemberDisplay(userId: $0.userId, role: $0.role, displayName: nameById[$0.userId] ?? "朋友",
                              active: Presence.isActive(seenMap[$0.userId] ?? nil))
            }

            if isOwner || memberRole == .coOwner {
                invites = (try? await session.repos.invites.active(listId: listId)) ?? []
            } else {
                invites = []
            }
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }

    // 局部更新（乐观 UI 用）
    func setStatus(placeId: String, status: PlaceStatus) {
        if let i = places.firstIndex(where: { $0.id == placeId }) { places[i].status = status }
    }

    func setMyTier(placeId: String, tier: PlaceTier?, userId: String) {
        var rows = (tiersByPlace[placeId] ?? []).filter { $0.userId != userId }
        if let tier, let p = places.first(where: { $0.id == placeId }) {
            rows.append(PlaceRatingRow(placeId: p.id, userId: userId, tier: tier.rawValue))
        }
        tiersByPlace[placeId] = rows
    }

    func remove(placeId: String) {
        places.removeAll { $0.id == placeId }
    }
}
