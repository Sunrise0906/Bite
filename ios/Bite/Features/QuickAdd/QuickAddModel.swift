import SwiftUI
import BiteCore

/// 智能添加（web 的 quick-add-input + /quick-add + /quick-add/multi）。
/// 输入 → 识别类型 → 店名搜索 / AI 抽取 → 确认（单店）或勾选（合集）→ 保存进清单。
@MainActor
@Observable
final class QuickAddModel {
    enum Step: Equatable {
        case input
        case confirm
        case multi
    }

    struct WritableList: Identifiable, Hashable {
        var id: String
        var name: String
        var isOwner: Bool
        var category: ListCategory
    }

    var step: Step = .input
    var text = ""
    var writableLists: [WritableList] = []
    var listsLoaded = false
    var targetListId: String?

    // 店名搜索
    var suggestions: [PlaceSuggestion] = []
    var searching = false
    var searchError: String?
    let sessionToken = UUID().uuidString.lowercased()
    var origin: LatLng?

    // AI 抽取
    var extracting = false
    var extractError: String?
    var draft: ExtractResponse?
    var displayPhotos: [String] = []   // draft.photoUrls 的展示版（拍照的图在私有桶要签名）

    // 单店确认表单
    var form = ConfirmForm()
    var selectedListId = ""
    var dupListIds: Set<String> = []
    var checkingDup = false

    // 合集
    var selected: Set<Int> = []
    var dupNamesByList: [String: Set<String>] = [:]

    var saving = false
    var saveError: String?

    struct ConfirmForm: Equatable {
        var name = ""
        var address = ""
        var cuisine = ""
        var status: PlaceStatus = .wantToGo
        var price: PlacePrice?
        var occasions = ""
        var tags = ""
        var recommendedBy = ""
        var reason = ""
        var notes = ""
        var dishes: [String] = []
        var source = "manual"
        var sourceUrl: String?
        var googlePlaceId: String?
        var lat: Double?
        var lng: Double?
        var photoUrls: [String] = []
        var confidence: String?
    }

    var detected: QuickAddDetect.InputType { QuickAddDetect.detect(text) }

    func loadLists(_ session: AppSession) async {
        guard let uid = session.userId, !listsLoaded else { return }
        do {
            let lists = try await session.repos.lists.fetchAll()
            let members = try await session.repos.lists.members(listIds: lists.map(\.id))
            let coOwner = Set(members.filter { $0.userId == uid && $0.role == .coOwner }.map(\.listId))
            writableLists = lists.filter { $0.ownerId == uid || coOwner.contains($0.id) }
                .sorted { ($0.createdAt ?? "") < ($1.createdAt ?? "") }
                .map { WritableList(id: $0.id, name: $0.name, isOwner: $0.ownerId == uid, category: $0.category) }
            listsLoaded = true
            if selectedListId.isEmpty {
                selectedListId = writableLists.first { $0.id == targetListId }?.id ?? writableLists.first?.id ?? ""
            }
        } catch {
            searchError = ErrorText.friendly(error)
        }
    }

    // MARK: - 店名搜索

    func search(_ session: AppSession) async {
        let q = text.trimmingCharacters(in: .whitespaces)
        guard case .placeName = detected, q.count >= 2 else { suggestions = []; return }
        searching = true; searchError = nil
        defer { searching = false }
        do {
            let r = try await session.api.autocomplete(input: q, origin: origin, session: sessionToken)
            // 用户可能已经改了输入，只接最新的
            if text.trimmingCharacters(in: .whitespaces) == q { suggestions = r }
        } catch {
            searchError = ErrorText.friendly(error)
        }
    }

    func pickSuggestion(_ s: PlaceSuggestion, session: AppSession) async {
        extracting = true; extractError = nil
        defer { extracting = false }
        do {
            let d = try await session.api.placeDetails(placeId: s.placeId, session: sessionToken)
            var f = ConfirmForm()
            f.name = d.name; f.address = d.address; f.cuisine = d.cuisine.joined(separator: ", ")
            f.source = "google_places"; f.googlePlaceId = d.placeId; f.lat = d.lat; f.lng = d.lng
            form = f
            draft = nil
            displayPhotos = []
            step = .confirm
            await checkDup(session)
        } catch {
            extractError = ErrorText.friendly(error)
        }
    }

    // MARK: - AI 抽取

    func extract(_ session: AppSession, image: Data? = nil, hint: String = "") async {
        extracting = true; extractError = nil
        defer { extracting = false }
        do {
            let req: ExtractRequest
            if let image {
                req = ExtractRequest(image: .init(base64: image.base64EncodedString(), mimeType: "image/jpeg", name: "photo.jpg"),
                                     hint: hint.isEmpty ? nil : hint, targetListId: targetListId)
            } else {
                let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { extractError = "请输入要识别的内容"; return }
                req = ExtractRequest(text: t, targetListId: targetListId)
            }
            let r = try await session.api.extract(req)
            draft = r
            displayPhotos = await session.photos.displayURLs(r.photoUrls)
            if r.isMulti {
                selected = Set(r.places.indices)
                step = .multi
                await checkDupMulti(session)
            } else if let p = r.places.first {
                form = Self.formFrom(p, draft: r)
                step = .confirm
                await checkDup(session)
            } else {
                extractError = "AI 没识别出店铺，换个说法试试"
            }
        } catch {
            extractError = ErrorText.friendly(error)
        }
    }

    static func formFrom(_ p: ExtractedPlace, draft: ExtractResponse) -> ConfirmForm {
        var f = ConfirmForm()
        f.name = p.name; f.address = p.address; f.cuisine = p.cuisine.joined(separator: ", ")
        f.status = p.status ?? .wantToGo; f.price = p.priceRange
        f.occasions = p.occasions.joined(separator: ", "); f.tags = p.tags.joined(separator: ", ")
        f.recommendedBy = p.recommendedBy ?? (draft.source == "xhs" ? "XHS博主" : "")
        f.reason = p.reason ?? ""; f.notes = p.notes ?? ""; f.dishes = p.dishes
        f.source = draft.source; f.sourceUrl = draft.sourceUrl
        f.photoUrls = draft.photoUrls
        f.confidence = p.confidence
        return f
    }

    // MARK: - 查重（提示和写入用同一个归一化键）

    func checkDup(_ session: AppSession) async {
        let nm = form.name.trimmingCharacters(in: .whitespaces)
        guard !nm.isEmpty else { dupListIds = []; return }
        checkingDup = true
        defer { checkingDup = false }
        var hits = Set<String>()
        for l in writableLists {
            if let rows = try? await session.repos.places.nameRows(listId: l.id), rows.contains(where: { NameKey.same($0.name, nm) }) {
                hits.insert(l.id)
            }
        }
        if form.name.trimmingCharacters(in: .whitespaces) == nm { dupListIds = hits }
    }

    func checkDupMulti(_ session: AppSession) async {
        guard let d = draft else { return }
        var out: [String: Set<String>] = [:]
        for l in writableLists {
            guard let rows = try? await session.repos.places.nameRows(listId: l.id) else { continue }
            var names = Set<String>()
            for p in d.places where rows.contains(where: { NameKey.same($0.name, p.name) }) { names.insert(p.name) }
            if !names.isEmpty { out[l.id] = names }
        }
        dupNamesByList = out
    }

    var isDuplicateInSelectedList: Bool { dupListIds.contains(selectedListId) }

    // MARK: - 保存

    func saveSingle(_ session: AppSession) async -> Bool {
        let nm = form.name.trimmingCharacters(in: .whitespaces)
        let addr = form.address.trimmingCharacters(in: .whitespaces)
        let cuisines = ParseTags.parse(form.cuisine)
        if selectedListId.isEmpty { saveError = "请选择要添加到的清单"; return false }
        if nm.isEmpty { saveError = "店名不能为空"; return false }
        if addr.isEmpty { saveError = "地址不能为空"; return false }
        if cuisines.isEmpty { saveError = "请填写至少一个类型标签（吃=菜系 / 喝=品类 / 玩=类型）"; return false }
        saving = true; saveError = nil
        defer { saving = false }
        let c = CandidateInput(
            name: nm, address: addr, cuisine: cuisines, priceRange: form.price?.rawValue, status: form.status.rawValue,
            occasions: ParseTags.parse(form.occasions), tags: ParseTags.parse(form.tags),
            recommendedBy: form.recommendedBy.trimmingCharacters(in: .whitespaces).isEmpty ? nil : form.recommendedBy,
            reason: form.reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : form.reason,
            notes: form.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : form.notes,
            dishes: form.dishes, photoUrls: form.photoUrls, source: form.source, sourceUrl: form.sourceUrl,
            googlePlaceId: form.googlePlaceId, lat: form.lat, lng: form.lng)
        do {
            let r = try await session.api.save(SaveRequest(listId: selectedListId, overrideMyReason: true, candidates: [c]))
            session.showToast(r.updated > 0 ? "已更新" : "已添加店铺")
            return true
        } catch {
            saveError = ErrorText.friendly(error)
            return false
        }
    }

    func saveMulti(_ session: AppSession) async -> Bool {
        guard let d = draft else { return false }
        if selectedListId.isEmpty { saveError = "请选择要添加到的清单"; return false }
        let picked = selected.sorted().compactMap { d.places.indices.contains($0) ? d.places[$0] : nil }.filter { !$0.isUnknownName }
        if picked.isEmpty { saveError = "这些条目没识别出店名，换个帖子或手动填一下"; return false }
        saving = true; saveError = nil
        defer { saving = false }
        let candidates = picked.map { p in
            CandidateInput(
                name: p.name.trimmingCharacters(in: .whitespaces), address: p.address, cuisine: p.cuisine,
                priceRange: p.priceRange?.rawValue, status: (p.status ?? .wantToGo).rawValue,
                occasions: p.occasions, tags: p.tags,
                recommendedBy: p.recommendedBy ?? (d.source == "xhs" ? "XHS博主" : nil),
                reason: p.reason, notes: p.notes, dishes: p.dishes,
                photoUrls: p.pickPhotos(from: d.photoUrls), source: d.source, sourceUrl: d.sourceUrl)
        }
        do {
            let r = try await session.api.save(SaveRequest(listId: selectedListId, overrideMyReason: false, candidates: candidates))
            let total = r.inserted + r.updated
            if r.updated > 0 { session.showToast(r.inserted == 0 ? "已合并 \(r.updated) 家到已有店铺" : "已添加 \(r.inserted) 家 · 合并 \(r.updated) 家") }
            else { session.showToast(total <= 1 ? "已添加店铺" : "已添加 \(total) 家店") }
            return true
        } catch {
            saveError = ErrorText.friendly(error)
            return false
        }
    }
}
