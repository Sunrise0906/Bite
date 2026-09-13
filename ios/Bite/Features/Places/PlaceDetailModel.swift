import SwiftUI
import BiteCore

@MainActor
@Observable
final class PlaceDetailModel {
    var place: Place?
    var displayPhotos: [String] = []
    var logs: [VisitLog] = []
    var signal: VisitSignal?
    var tierRows: [PlaceRatingRow] = []
    var tierAuthors: [String: String] = [:]
    var reasonAuthors: [String: String] = [:]
    var comments: [CommentView] = []
    var addedBy: String?
    var opening: OpeningInfo?
    var canEdit = false
    var isLoading = false
    var loadedOnce = false
    var notFound = false
    var error: String?

    func load(_ session: AppSession, listId: String, placeId: String) async {
        guard let uid = session.userId else { return }
        if !loadedOnce { isLoading = true }
        defer { isLoading = false; loadedOnce = true }
        error = nil
        do {
            async let placeTask = session.repos.places.fetch(id: placeId)
            async let logsTask = session.repos.visits.fetch(placeId: placeId)
            async let listTask = session.repos.lists.fetch(id: listId)
            async let membersTask = session.repos.lists.members(listId: listId)
            async let tiersTask = session.repos.ratings.fetch(placeIds: [placeId])
            async let commentsTask = session.repos.comments.fetch(placeId: placeId)
            let (place, logs, list, members, tiers, commentRows) = try await (placeTask, logsTask, listTask, membersTask, tiersTask, commentsTask)
            guard let place, place.listId == listId else { notFound = true; return }
            self.place = place
            self.logs = logs
            signal = VisitAggregate.signals(logs)[placeId]
            tierRows = tiers
            let isOwner = list?.ownerId == uid
            canEdit = isOwner || members.first { $0.userId == uid }?.role == .coOwner

            var ids = Set<String>()
            for r in place.reasons where r.userId != uid { ids.insert(r.userId) }
            for r in tiers where r.userId != uid { ids.insert(r.userId) }
            for c in commentRows { ids.insert(c.userId) }
            if let cb = place.createdBy { ids.insert(cb) }
            let profiles = try await session.repos.profiles.fetch(ids: Array(ids))
            let nameById = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0.displayName) })
            reasonAuthors = nameById
            tierAuthors = nameById
            comments = commentRows.map {
                CommentView(id: $0.id, userId: $0.userId, author: $0.userId == uid ? (session.profile?.displayName ?? "我") : (nameById[$0.userId] ?? "朋友"),
                            body: $0.body, createdAt: $0.createdAt, editable: $0.userId == uid)
            }
            if let cb = place.createdBy { addedBy = cb == uid ? "你" : (nameById[cb] ?? "朋友") }

            displayPhotos = await session.photos.displayURLs(place.photoUrls)

            if let gid = place.googlePlaceId {
                opening = try? await session.api.opening(placeId: gid)
            }
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }

    var tierSummary: TierSummary {
        TierSummary.summarize(tierRows, currentUserId: currentUserId)
    }
    var currentUserId = ""

    func setMyTier(_ tier: PlaceTier?, userId: String) {
        tierRows.removeAll { $0.userId == userId }
        if let tier, let p = place { tierRows.append(PlaceRatingRow(placeId: p.id, userId: userId, tier: tier.rawValue)) }
    }
}
