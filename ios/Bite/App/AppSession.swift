import SwiftUI
import Supabase
import BiteCore

struct Toast: Equatable, Identifiable {
    enum Kind { case success, error, info }
    let id = UUID()
    var message: String
    var kind: Kind
}

/// 全局会话：Supabase client、登录态、当前用户资料、主题、toast、深链 / 分享的中转。
@MainActor
@Observable
final class AppSession {
    static let shared = AppSession()

    enum AuthState: Equatable {
        case loading
        case signedOut
        case signedIn(userId: String, email: String?)
    }

    let supabase: SupabaseClient
    let api: BiteAPI
    let repos: Repos
    let photos: PhotoService
    let router = Router()

    var authState: AuthState = .loading
    var profile: Profile?
    var theme: BiteTheme {
        didSet { UserDefaults.standard.set(theme.rawValue, forKey: Self.themeKey) }
    }
    var toast: Toast?
    /// 分享扩展送进来的内容，RootView 据此弹智能添加
    var pendingShare: SharePayload?

    private var pendingRoute: DeepLinkRoute?
    private var authTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?

    private static let themeKey = "bite_theme"
    /// 注册时填的昵称：邮箱验证后第一次登录再写进 profiles（注册接口不带 metadata，见 AuthFlowView）
    static let pendingNameKey = "bite_pending_signup_name"

    init() {
        let client = SupabaseClient(supabaseURL: Env.supabaseURL, supabaseKey: Env.supabaseAnonKey)
        supabase = client
        api = BiteAPI(baseURL: Env.apiBaseURL) { try await client.auth.session.accessToken }
        repos = Repos(client: client)
        photos = PhotoService(client: client, supabaseURL: Env.supabaseURLString)
        theme = BiteTheme(rawValue: UserDefaults.standard.string(forKey: Self.themeKey) ?? "") ?? .terracotta
        PushService.shared.api = api
    }

    var userId: String? { if case .signedIn(let id, _) = authState { return id }; return nil }
    var email: String? { if case .signedIn(_, let e) = authState { return e }; return nil }
    var isSignedIn: Bool { userId != nil }

    /// 显示名（昵称 → 邮箱前缀 → 你）
    var displayName: String {
        if let p = profile { return p.displayName }
        if let e = email, let prefix = e.split(separator: "@").first { return String(prefix) }
        return "你"
    }

    // MARK: - 生命周期

    func start() {
        guard authTask == nil else { return }
        guard Env.isConfigured else { authState = .signedOut; return }
        authTask = Task { [weak self] in
            guard let self else { return }
            for await change in self.supabase.auth.authStateChanges {
                self.apply(event: change.event, session: change.session)
            }
        }
    }

    private func apply(event: AuthChangeEvent, session: Session?) {
        switch event {
        case .initialSession, .signedIn, .tokenRefreshed, .userUpdated:
            if let session {
                let uid = session.user.id.uuidString.lowercased()
                let changed = userId != uid
                authState = .signedIn(userId: uid, email: session.user.email)
                if changed { Task { await onSignedIn(userId: uid, email: session.user.email) } }
            } else {
                authState = .signedOut
            }
        case .signedOut, .userDeleted:
            authState = .signedOut
            profile = nil
            heartbeatTask?.cancel()
            heartbeatTask = nil
        default:
            break
        }
    }

    private func onSignedIn(userId: String, email: String?) async {
        await applyPendingSignupName(userId: userId, email: email)
        await loadProfile()
        await PushService.shared.registerIfAuthorized()
        startHeartbeat(userId: userId)
        if let route = pendingRoute {
            pendingRoute = nil
            router.open(route)
        }
        checkShareInbox()
    }

    func loadProfile() async {
        guard let uid = userId else { return }
        if let p = try? await repos.profiles.fetch(id: uid) { profile = p }
    }

    /// 注册时填的昵称，邮箱验证后第一次登录写进去（profiles.name 默认是邮箱前缀）
    private func applyPendingSignupName(userId: String, email: String?) async {
        guard let raw = UserDefaults.standard.string(forKey: Self.pendingNameKey) else { return }
        let parts = raw.split(separator: "\n", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { UserDefaults.standard.removeObject(forKey: Self.pendingNameKey); return }
        let (forEmail, name) = (parts[0], parts[1])
        guard forEmail.lowercased() == (email ?? "").lowercased(), !name.isEmpty else { return }
        try? await repos.profiles.update(id: userId, name: name, avatarUrl: nil)
        UserDefaults.standard.removeObject(forKey: Self.pendingNameKey)
    }

    /// 30 秒一次的「刚刚在线」心跳（仅前台）
    private func startHeartbeat(userId: String) {
        heartbeatTask?.cancel()
        let repo = repos.lists
        heartbeatTask = Task {
            while !Task.isCancelled {
                if UIApplication.shared.applicationState == .active { await repo.heartbeat(userId: userId) }
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
    }

    func signOut() async {
        await PushService.shared.unregister()
        try? await supabase.auth.signOut()
        authState = .signedOut
        profile = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        router.reset()
    }

    // MARK: - 深链 / 分享

    func handleURL(_ url: URL) {
        if url.scheme?.lowercased() == Env.urlScheme, url.host?.lowercased() == "auth" {
            // Magic link / 注册验证邮件 / OAuth 回跳（PKCE code 换 session）
            Task {
                do { try await supabase.auth.session(from: url) } catch { showError(error) }
            }
            return
        }
        if let route = DeepLink.parse(url: url, webHost: Env.webHost) { open(route) }
    }

    /// 推送 payload 里的站内路径
    func handleDeepLinkPath(_ path: String) {
        if let route = DeepLink.parse(path: path) { open(route) }
    }

    func open(_ route: DeepLinkRoute) {
        if case .share = route { checkShareInbox(); return }
        guard isSignedIn else { pendingRoute = route; return }
        router.open(route)
    }

    /// 进前台时看分享扩展有没有留东西
    func checkShareInbox() {
        guard isSignedIn, let p = ShareInbox.read(appGroup: Env.appGroup) else { return }
        pendingShare = p
    }

    func consumeShare() -> SharePayload? {
        defer { pendingShare = nil; ShareInbox.clear(appGroup: Env.appGroup) }
        return pendingShare
    }

    // MARK: - Toast

    func showToast(_ message: String, kind: Toast.Kind = .success) {
        toast = Toast(message: message, kind: kind)
    }

    func showError(_ error: Error) {
        toast = Toast(message: ErrorText.friendly(error), kind: .error)
    }
}

/// 把 SDK / 网络错误翻成中文（web 的 translateError 同款）
enum ErrorText {
    static func friendly(_ error: Error) -> String {
        if let e = error as? BiteAPIError { return e.errorDescription ?? "出错了" }
        if let e = error as? RepoError { return e.errorDescription ?? "出错了" }
        let raw = error.localizedDescription
        let m = raw.lowercased()
        if m.contains("invalid login credentials") { return "邮箱或密码错误" }
        if m.contains("email not confirmed") { return "邮箱尚未验证，请查收验证邮件" }
        if m.contains("user already registered") { return "该邮箱已注册，请直接登录" }
        if m.contains("password should be at least") { return "密码至少 6 位" }
        if m.contains("rate limit") || m.contains("for security purposes") { return "请求过于频繁，请稍后再试" }
        if m.contains("network") || m.contains("offline") || m.contains("internet") { return "网络不可用，稍后再试" }
        if m.contains("jwt") || m.contains("session") && m.contains("missing") { return "登录已过期，请重新登录" }
        return raw
    }
}
