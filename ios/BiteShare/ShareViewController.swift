import UIKit
import Social
import UniformTypeIdentifiers

/// 「分享到 Bite」：小红书 App / Safari / 相册里分享 → 这里 → 写进 App Group 交接盒 → 主 App 走智能添加。
/// iOS 的 PWA 不支持 Share Target，这是 web 版做不到、原生 App 最有价值的一点（docs/SETUP.md 路线图第 4 条）。
final class ShareViewController: SLComposeServiceViewController {
    private var appGroup: String {
        (Bundle.main.object(forInfoDictionaryKey: "BITE_APP_GROUP") as? String) ?? ""
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        placeholder = "给 Bite 的备注（选填）"
        navigationController?.navigationBar.tintColor = UIColor(red: 0.78, green: 0.36, blue: 0.23, alpha: 1)
        title = "发到 Bite"
    }

    override func isContentValid() -> Bool { true }

    override func didSelectPost() {
        let note = contentText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?.flatMap { $0.attachments ?? [] } ?? []
        Task {
            let payload = await Self.buildPayload(providers: providers, note: note, appGroup: appGroup)
            if let payload { try? ShareInbox.write(payload, appGroup: appGroup) }
            await MainActor.run {
                self.openContainerApp()
                self.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }

    override func configurationItems() -> [Any]! { [] }

    // MARK: - 解析分享内容

    private static func buildPayload(providers: [NSItemProvider], note: String, appGroup: String) async -> SharePayload? {
        // 优先链接（小红书分享出来的是 URL + 文案）
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = await load(p, UTType.url.identifier) as? URL, !url.isFileURL {
                let text = note.isEmpty ? url.absoluteString : "\(url.absoluteString)\n\(note)"
                return SharePayload(kind: .url, text: text)
            }
        }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let s = await load(p, UTType.plainText.identifier) as? String {
                let text = note.isEmpty || s.contains(note) ? s : "\(s)\n\(note)"
                return SharePayload(kind: .text, text: text)
            }
        }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
            let item = await load(p, UTType.image.identifier)
            var image: UIImage?
            if let u = item as? URL, let d = try? Data(contentsOf: u) { image = UIImage(data: d) }
            else if let d = item as? Data { image = UIImage(data: d) }
            else if let i = item as? UIImage { image = i }
            if let image, let jpeg = compress(image), let file = try? ShareInbox.storeImage(jpeg, ext: "jpg", appGroup: appGroup) {
                return SharePayload(kind: .image, text: note.isEmpty ? nil : note, imageFile: file)
            }
        }
        if !note.isEmpty { return SharePayload(kind: .text, text: note) }
        return nil
    }

    private static func load(_ p: NSItemProvider, _ type: String) async -> Any? {
        await withCheckedContinuation { cont in
            p.loadItem(forTypeIdentifier: type, options: nil) { item, _ in cont.resume(returning: item) }
        }
    }

    private static func compress(_ image: UIImage, maxDim: CGFloat = 2048) -> Data? {
        let scale = min(1, maxDim / max(image.size.width, image.size.height))
        let target = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
        let f = UIGraphicsImageRendererFormat(); f.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: f).image { _ in image.draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: 0.85)
    }

    // MARK: - 唤起主 App

    /// 分享扩展官方上不能打开宿主 App；这里走 responder chain 的老办法，成功就直接进智能添加，
    /// 不成功也没关系 —— 主 App 下次进前台会自己读交接盒。
    private func openContainerApp() {
        guard let url = URL(string: "bite://share") else { return }
        let selector = sel_registerName("openURL:")
        var responder: UIResponder? = self
        while let r = responder {
            if r !== self, r.responds(to: selector) {
                r.perform(selector, with: url)
                return
            }
            responder = r.next
        }
    }
}
