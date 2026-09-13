import SwiftUI
import BiteCore

/// 页面路由（NavigationStack 的 path 元素）。与 web 的 URL 一一对应：
/// /lists/<id> · /lists/<id>/places/<pid> · /lists/<id>/places/<pid>/edit · /lists/<id>/pick · /stats · /recommendations …
enum AppRoute: Hashable {
    case list(String)
    case place(listId: String, placeId: String)
    case placeForm(listId: String, placeId: String?)
    case pick(listId: String)
    case stats
    case recommendations
    case llmSettings
    case conversation(id: String?, scopeListId: String?)
}

/// 外部进来的意图：bite:// 深链、universal link、推送 payload 里的站内路径、分享扩展。
enum DeepLinkRoute: Equatable {
    case list(String)
    case place(listId: String, placeId: String)
    case invite(token: String)
    case recommendations
    case chat(listId: String?)
    case profile
    case nearby
    case share
}

/// 智能添加的种子：从分享扩展 / 清单页带过来的初始内容
struct QuickAddSeed: Identifiable, Equatable {
    let id = UUID()
    var text: String?
    var imageData: Data?
    var targetListId: String?

    static func == (a: QuickAddSeed, b: QuickAddSeed) -> Bool { a.id == b.id }
}

enum DeepLink {
    static func parse(url: URL, webHost: String) -> DeepLinkRoute? {
        if url.scheme?.lowercased() == Env.urlScheme {
            // bite://lists/<id>/places/<pid> → host 是第一段
            var parts: [String] = []
            if let h = url.host, !h.isEmpty { parts.append(h) }
            parts.append(contentsOf: url.pathComponents.filter { $0 != "/" })
            return parse(path: "/" + parts.joined(separator: "/"))
        }
        if let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
           let host = url.host?.lowercased(), !webHost.isEmpty, host == webHost.lowercased() {
            return parse(path: url.path)
        }
        return nil
    }

    /// 站内路径（推送 payload 的 url 字段 / universal link 的 path）
    static func parse(path rawPath: String) -> DeepLinkRoute? {
        let path = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? rawPath
        let comps = path.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        guard let first = comps.first else { return nil }
        switch first {
        case "lists":
            if comps.count >= 4, comps[2] == "places" { return .place(listId: comps[1], placeId: comps[3]) }
            if comps.count >= 2 { return .list(comps[1]) }
            return nil
        case "invite":
            return comps.count >= 2 ? .invite(token: comps[1]) : nil
        case "recommendations": return .recommendations
        case "chat": return .chat(listId: nil)
        case "profile": return .profile
        case "map", "nearby": return .nearby
        case "share": return .share
        default: return nil
        }
    }
}

@MainActor
@Observable
final class Router {
    enum Tab: Hashable { case lists, nearby, chat, profile }

    var tab: Tab = .lists
    var listsPath: [AppRoute] = []
    var nearbyPath: [AppRoute] = []
    var chatPath: [AppRoute] = []
    var profilePath: [AppRoute] = []

    /// 邀请接受页（sheet）
    var inviteToken: String?
    /// 智能添加（sheet）
    var quickAddSeed: QuickAddSeed?

    func open(_ route: DeepLinkRoute) {
        switch route {
        case .list(let id):
            tab = .lists
            listsPath = [.list(id)]
        case .place(let listId, let placeId):
            tab = .lists
            listsPath = [.list(listId), .place(listId: listId, placeId: placeId)]
        case .invite(let token):
            inviteToken = token
        case .recommendations:
            tab = .profile
            profilePath = [.recommendations]
        case .chat(let listId):
            tab = .chat
            chatPath = listId.map { [.conversation(id: nil, scopeListId: $0)] } ?? []
        case .profile:
            tab = .profile
            profilePath = []
        case .nearby:
            tab = .nearby
            nearbyPath = []
        case .share:
            break // AppSession 处理
        }
    }

    func reset() {
        tab = .lists
        listsPath = []; nearbyPath = []; chatPath = []; profilePath = []
        inviteToken = nil; quickAddSeed = nil
    }
}
