import SwiftUI
import BiteCore

/// 主页（web 的 /lists → renderHomeV2）的数据：清单行 + 想去 deck + 决策中枢。
@MainActor
@Observable
final class HomeModel {
    struct ListVM: Identifiable, Hashable {
        var id: String
        var name: String
        var count: Int
        var wantCount: Int
        var visitedCount: Int
        var activityLabel: String
        var thumbs: [String]
        var isShared: Bool
        var isOwner: Bool
        var canEdit: Bool
        var faces: [Face]
        var memberTotal: Int
        var category: ListCategory

        struct Face: Hashable { var initial: String; var sage: Bool }
    }

    struct DeckItem: Identifiable, Hashable {
        var placeId: String
        var listId: String
        var name: String
        var cuisine: [String]
        var price: String?
        var photo: String?
        var reason: String?
        var id: String { placeId }
    }

    var lists: [ListVM] = []
    var deck: [DeckItem] = []
    var heroPhoto: String?
    var totalPlaces = 0
    var totalWant = 0
    var isLoading = false
    var loadedOnce = false
    var error: String?

    func load(_ session: AppSession) async {
        guard let uid = session.userId else { return }
        if !loadedOnce { isLoading = true }
        defer { isLoading = false; loadedOnce = true }
        error = nil
        do {
            let lists = try await session.repos.lists.fetchAll()
            let listIds = lists.map(\.id)
            async let placesTask = session.repos.places.fetchForLists(listIds)
            async let membersTask = session.repos.lists.members(listIds: listIds)
            let (places, members) = try await (placesTask, membersTask)

            var membersByList: [String: [ListMember]] = [:]
            for m in members { membersByList[m.listId, default: []].append(m) }

            var ids = Set<String>([uid])
            for l in lists { ids.insert(l.ownerId) }
            for m in members { ids.insert(m.userId) }
            let profiles = try await session.repos.profiles.fetch(ids: Array(ids))
            let nameById = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.displayName) })
            func initial(_ id: String) -> String { String((nameById[id] ?? "?").prefix(1)).uppercased() }

            // 封面签名：每家店只要第一张
            let covers = places.compactMap(\.coverUrl)
            let signed = await session.photos.signedMap(for: covers)
            func display(_ u: String?) -> String? { u.map { signed[$0] ?? $0 } }

            var placesByList: [String: [Place]] = [:]
            for p in places { placesByList[p.listId, default: []].append(p) }

            func maxActivity(_ l: BiteList) -> String {
                var m = l.updatedAt ?? ""
                for p in placesByList[l.id] ?? [] where (p.updatedAt ?? "") > m { m = p.updatedAt ?? m }
                return m
            }
            let sorted = lists.sorted { maxActivity($0) > maxActivity($1) }

            self.lists = sorted.map { l in
                let ps = placesByList[l.id] ?? []
                let ms = membersByList[l.id] ?? []
                let myRole = ms.first { $0.userId == uid }?.role
                let isOwner = l.ownerId == uid
                var faceIds: [String] = [l.ownerId]
                for m in ms where !faceIds.contains(m.userId) { faceIds.append(m.userId) }
                let thumbs = ps.filter { $0.coverUrl != nil }
                    .sorted { ($0.updatedAt ?? "") > ($1.updatedAt ?? "") }
                    .prefix(3).compactMap { display($0.coverUrl) }
                return ListVM(
                    id: l.id, name: l.name, count: ps.count,
                    wantCount: ps.filter { $0.status == .wantToGo }.count,
                    visitedCount: ps.filter { $0.status == .visited }.count,
                    activityLabel: RelDate.relativeTime(maxActivity(l)),
                    thumbs: Array(thumbs),
                    isShared: !isOwner || !ms.isEmpty,
                    isOwner: isOwner,
                    canEdit: isOwner || myRole == .coOwner,
                    faces: faceIds.prefix(3).map { .init(initial: initial($0), sage: $0 != uid) },
                    memberTotal: faceIds.count,
                    category: l.category
                )
            }

            var deckAll: [DeckItem] = []
            for l in lists {
                for p in placesByList[l.id] ?? [] where p.status == .wantToGo {
                    deckAll.append(DeckItem(placeId: p.id, listId: l.id, name: p.name, cuisine: p.cuisine,
                                            price: p.priceRange?.rawValue, photo: display(p.coverUrl),
                                            reason: p.shownReason(for: uid)?.text))
                }
            }
            // 有图的优先靠前（稳定排序）
            let withPhoto = deckAll.filter { $0.photo != nil }
            let without = deckAll.filter { $0.photo == nil }
            deck = Array((withPhoto + without).prefix(8))

            heroPhoto = nil
            for l in sorted {
                if let p = (placesByList[l.id] ?? []).first(where: { $0.coverUrl != nil }) { heroPhoto = display(p.coverUrl); break }
            }
            totalPlaces = places.count
            totalWant = places.filter { $0.status == .wantToGo }.count
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }
}
