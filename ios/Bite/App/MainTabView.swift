import SwiftUI
import BiteCore

/// 底部四个 tab（清单 / 附近 / 聊天 / 我的），与 web 的 bottom-nav 一致。
/// 每个 tab 各自一个 NavigationStack，path 存在 Router 上，深链 / 推送才能直接推到某一页。
struct MainTabView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t

    var body: some View {
        @Bindable var router = session.router
        TabView(selection: $router.tab) {
            NavigationStack(path: $router.listsPath) {
                HomeView().appRoutes()
            }
            .tabItem { Label("清单", systemImage: "list.bullet") }
            .tag(Router.Tab.lists)

            NavigationStack(path: $router.nearbyPath) {
                NearbyView().appRoutes()
            }
            .tabItem { Label("附近", systemImage: "map") }
            .tag(Router.Tab.nearby)

            NavigationStack(path: $router.chatPath) {
                ChatHomeView().appRoutes()
            }
            .tabItem { Label("聊天", systemImage: "bubble.left.and.text.bubble.right") }
            .tag(Router.Tab.chat)

            NavigationStack(path: $router.profilePath) {
                ProfileView().appRoutes()
            }
            .tabItem { Label("我的", systemImage: "person") }
            .tag(Router.Tab.profile)
        }
        .tint(t.primary)
        .sheet(item: Binding(
            get: { session.router.inviteToken.map { InviteSheetItem(token: $0) } },
            set: { if $0 == nil { session.router.inviteToken = nil } }
        )) { item in
            InviteAcceptView(token: item.token)
        }
        .sheet(item: $router.quickAddSeed) { seed in
            QuickAddFlowView(seed: seed)
        }
        .onChange(of: session.pendingShare) { _, incoming in
            guard incoming != nil, let share = session.consumeShare() else { return }
            var seed = QuickAddSeed()
            switch share.kind {
            case .url, .text:
                seed.text = share.text
            case .image:
                if let f = share.imageFile, let url = ShareInbox.imageURL(f, appGroup: Env.appGroup) {
                    seed.imageData = try? Data(contentsOf: url)
                }
                seed.text = share.text
            }
            session.router.quickAddSeed = seed
        }
    }
}

struct InviteSheetItem: Identifiable {
    var token: String
    var id: String { token }
}

/// 所有 tab 共用的 push 目标
struct AppRoutesModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .list(let id):
                ListDetailView(listId: id)
            case .place(let listId, let placeId):
                PlaceDetailView(listId: listId, placeId: placeId)
            case .placeForm(let listId, let placeId):
                PlaceFormView(listId: listId, placeId: placeId)
            case .pick(let listId):
                PickDeckView(listId: listId)
            case .stats:
                StatsView()
            case .recommendations:
                RecommendationsView()
            case .llmSettings:
                LlmSettingsView()
            case .conversation(let id, let scopeListId):
                ChatView(conversationId: id, scopeListId: scopeListId)
            }
        }
    }
}

extension View {
    func appRoutes() -> some View { modifier(AppRoutesModifier()) }
}
