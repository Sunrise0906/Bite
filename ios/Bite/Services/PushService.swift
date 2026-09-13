import Foundation
import UIKit
import UserNotifications

/// APNs 登记：拿到 device token 后 POST /api/mobile/push（sql/0029）。
/// 退出登录时注销，换账号不会把通知发给上一个人。
@MainActor
final class PushService {
    static let shared = PushService()
    private let tokenKey = "bite_apns_token"

    /// 由 AppSession 在登录后注入
    var api: BiteAPI?

    private(set) var lastToken: String? {
        get { UserDefaults.standard.string(forKey: tokenKey) }
        set { UserDefaults.standard.set(newValue, forKey: tokenKey) }
    }

    static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// 用户在设置页点「开启」
    func requestAuthorizationAndRegister() async -> Bool {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted { UIApplication.shared.registerForRemoteNotifications() }
        return granted
    }

    /// 每次登录 / 冷启动：已授权就静默重新登记（token 可能变了）
    func registerIfAuthorized() async {
        if await authorizationStatus() == .authorized {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func deviceTokenReceived(_ hex: String) async {
        lastToken = hex
        guard let api else { return }
        do { try await api.registerPush(token: hex, environment: Self.environment) } catch {
            // sql/0029 没跑 / 网络问题：静默，下次登录再试
        }
    }

    /// 退出登录时调
    func unregister() async {
        guard let token = lastToken, let api else { return }
        try? await api.unregisterPush(token: token)
    }
}
