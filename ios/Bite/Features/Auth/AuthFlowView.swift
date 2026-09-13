import SwiftUI
import AuthenticationServices
import Supabase
import BiteCore

/// 登录 / 注册（web 的 (auth)/login 与 signup）：邮箱密码 + Magic Link + Google。
struct AuthFlowView: View {
    @Environment(\.bite) private var t
    @State private var mode: Mode = .login

    enum Mode { case login, signup }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                Text("Bite").font(t.brand).foregroundStyle(t.primaryDeep).padding(.top, 48)
                Group {
                    if mode == .login { LoginForm(switchToSignup: { mode = .signup }) }
                    else { SignUpForm(switchToLogin: { mode = .login }) }
                }
                .padding(.horizontal, 22).padding(.vertical, 26)
                .biteCard(padding: 0, radius: t.radii.xl, shadow: .card)
                .padding(.horizontal, 20)
            }
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(t.bg)
    }
}

private struct AuthDivider: View {
    @Environment(\.bite) private var t
    var body: some View {
        HStack(spacing: 12) {
            Rectangle().fill(t.border).frame(height: 1)
            Text("或").font(t.text(12)).foregroundStyle(t.faint)
            Rectangle().fill(t.border).frame(height: 1)
        }
    }
}

/// bite://auth/callback —— Supabase Auth → URL Configuration → Redirect URLs 里必须加这一条
let authRedirectURL = URL(string: "\(Env.urlScheme)://auth/callback")!

private struct LoginForm: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var switchToSignup: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var magicEmail = ""
    @State private var busy = false
    @State private var error: String?
    @State private var notice: String?

    var body: some View {
        VStack(spacing: 18) {
            VStack(spacing: 6) {
                Text("欢迎回来").font(t.display(28)).foregroundStyle(t.ink)
                Text("登录你的 Bite 账号").font(t.text(14)).foregroundStyle(t.muted)
            }

            VStack(spacing: 10) {
                TextField("邮箱", text: $email)
                    .textContentType(.emailAddress).keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .biteField()
                SecureField("密码", text: $password)
                    .textContentType(.password)
                    .biteField()
                if let error { ErrorBanner(message: error) }
                if let notice { SuccessBanner(message: notice) }
                Button { Task { await signInWithPassword() } } label: {
                    Text(busy ? "登录中…" : "登录").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bite(.primary, full: true))
                .disabled(busy || email.isEmpty || password.isEmpty)
                Text("忘了密码？下面的「魔法链接登录」也能进，不用密码")
                    .font(t.text(12)).foregroundStyle(t.muted).multilineTextAlignment(.center)
            }

            AuthDivider()

            VStack(spacing: 10) {
                TextField("邮箱", text: $magicEmail)
                    .textContentType(.emailAddress).keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .biteField()
                Button { Task { await sendMagicLink() } } label: {
                    Label(busy ? "发送中…" : "发送登录链接到邮箱", systemImage: "paperplane").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bite(.ghost, full: true))
                .disabled(busy || magicEmail.isEmpty)
            }

            AuthDivider()

            GoogleSignInButton(busy: $busy, error: $error)

            HStack(spacing: 4) {
                Text("还没有账号？").font(t.text(14)).foregroundStyle(t.muted)
                Button("创建账号", action: switchToSignup).font(t.text(14, weight: .medium)).foregroundStyle(t.ink).underline()
            }
        }
    }

    private func signInWithPassword() async {
        busy = true; error = nil; notice = nil
        defer { busy = false }
        do {
            _ = try await session.supabase.auth.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }

    private func sendMagicLink() async {
        busy = true; error = nil; notice = nil
        defer { busy = false }
        do {
            try await session.supabase.auth.signInWithOTP(email: magicEmail.trimmingCharacters(in: .whitespaces), redirectTo: authRedirectURL)
            notice = "登录链接已发送！查收邮箱，点击链接即可登录。"
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }
}

private struct SignUpForm: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var switchToLogin: () -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var notice: String?

    var body: some View {
        VStack(spacing: 18) {
            VStack(spacing: 6) {
                Text("开个号").font(t.display(28)).foregroundStyle(t.ink)
                Text("开始记录你的餐厅，做更好的决策").font(t.text(14)).foregroundStyle(t.muted)
            }
            VStack(spacing: 10) {
                TextField("昵称（选填）", text: $name).textContentType(.name).biteField()
                TextField("邮箱（QQ / 163 / Gmail 都可以）", text: $email)
                    .textContentType(.emailAddress).keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .biteField()
                SecureField("密码（至少 6 位）", text: $password).textContentType(.newPassword).biteField()
                if let error { ErrorBanner(message: error) }
                if let notice { SuccessBanner(message: notice) }
                Button { Task { await signUp() } } label: {
                    Text(busy ? "创建中…" : "创建账号").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bite(.primary, full: true))
                .disabled(busy || email.isEmpty || password.count < 6)
            }

            AuthDivider()
            GoogleSignInButton(busy: $busy, error: $error)

            HStack(spacing: 4) {
                Text("已经有账号？").font(t.text(14)).foregroundStyle(t.muted)
                Button("登录", action: switchToLogin).font(t.text(14, weight: .medium)).foregroundStyle(t.ink).underline()
            }
        }
    }

    private func signUp() async {
        busy = true; error = nil; notice = nil
        defer { busy = false }
        let mail = email.trimmingCharacters(in: .whitespaces)
        do {
            // 昵称不走注册 metadata（SDK 版本间 JSON 类型名有变动）；存本地，验证邮箱后首次登录写进 profiles
            let nick = name.trimmingCharacters(in: .whitespaces)
            if !nick.isEmpty { UserDefaults.standard.set("\(mail)\n\(nick)", forKey: AppSession.pendingNameKey) }
            let resp = try await session.supabase.auth.signUp(email: mail, password: password, redirectTo: authRedirectURL)
            if resp.session == nil {
                notice = "注册成功！请查收邮箱点击验证链接完成登录。"
            }
        } catch {
            self.error = ErrorText.friendly(error)
        }
    }
}

/// Google OAuth：ASWebAuthenticationSession → bite://auth/callback → 换 session
private struct GoogleSignInButton: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @Binding var busy: Bool
    @Binding var error: String?

    var body: some View {
        Button { Task { await signIn() } } label: {
            HStack(spacing: 8) {
                Image(systemName: "g.circle.fill").font(.system(size: 18))
                Text("使用 Google 登录")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bite(.ghost, full: true))
        .disabled(busy)
    }

    private func signIn() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            let url = try session.supabase.auth.getOAuthSignInURL(provider: .google, redirectTo: authRedirectURL)
            let callback = try await WebAuthPresenter.shared.start(url: url, callbackScheme: Env.urlScheme)
            try await session.supabase.auth.session(from: callback)
        } catch {
            if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { return }
            self.error = ErrorText.friendly(error)
        }
    }
}

/// ASWebAuthenticationSession 的 async 封装
final class WebAuthPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = WebAuthPresenter()
    private var current: ASWebAuthenticationSession?

    @MainActor
    func start(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { cont in
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { url, err in
                if let url { cont.resume(returning: url) }
                else { cont.resume(throwing: err ?? NSError(domain: "WebAuth", code: 1, userInfo: [NSLocalizedDescriptionKey: "Google 登录初始化失败"])) }
            }
            s.presentationContextProvider = self
            s.prefersEphemeralWebBrowserSession = false
            current = s
            s.start()
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
