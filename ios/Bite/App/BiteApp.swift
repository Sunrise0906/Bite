import SwiftUI
import BiteCore

@main
struct BiteApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session = AppSession.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .onOpenURL { session.handleURL($0) }
                .onAppear { session.start() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { session.checkShareInbox() }
                }
                // 深夜食堂永远是暗的；其他主题跟随系统
                .preferredColorScheme(session.theme.forcesDark ? .dark : nil)
        }
    }
}

struct RootView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        ThemedRoot(theme: session.theme) {
            Group {
                if !Env.isConfigured {
                    SetupNeededView()
                } else {
                    switch session.authState {
                    case .loading:
                        SplashView()
                    case .signedOut:
                        AuthFlowView()
                    case .signedIn:
                        MainTabView()
                    }
                }
            }
            .overlay(alignment: .top) { ToastOverlay() }
        }
    }
}

/// 冷启动读 keychain 里的 session 时的一瞬间
struct SplashView: View {
    @Environment(\.bite) private var t
    var body: some View {
        ZStack {
            t.bg.ignoresSafeArea()
            Text("Bite").font(t.display(44, weight: .semibold)).foregroundStyle(t.primaryDeep)
        }
    }
}

/// Config/Local.xcconfig 还没填时的提示（不崩溃，告诉人怎么配）
struct SetupNeededView: View {
    @Environment(\.bite) private var t
    var body: some View {
        ZStack {
            t.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 14) {
                Text("Bite").font(t.display(40)).foregroundStyle(t.primaryDeep)
                Text("还没配置服务器地址").font(t.display(22)).foregroundStyle(t.ink)
                Text("复制 ios/Config/Local.xcconfig.example 为 Local.xcconfig，填入 SUPABASE_URL / SUPABASE_ANON_KEY / BITE_API_BASE_URL 后重新构建。详见 ios/README.md。")
                    .font(t.text(14)).foregroundStyle(t.muted)
            }
            .padding(24)
            .biteCard()
            .padding(20)
        }
    }
}
