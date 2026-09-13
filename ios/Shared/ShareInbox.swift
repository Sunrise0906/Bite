import Foundation

// 「分享到 Bite」的交接盒：BiteShare 扩展把用户分享的内容（小红书链接 / 文字 / 一张图）
// 写进 App Group 容器里的一个 JSON 文件，主 App 下次进前台时读走并清掉。
// 两个 target 都编译这个文件（见 project.yml）。

public struct SharePayload: Codable, Equatable {
    public enum Kind: String, Codable { case url, text, image }
    public var kind: Kind
    /// 链接或文字（image 时可能是附带的说明）
    public var text: String?
    /// App Group 容器内的相对文件名（image 时）
    public var imageFile: String?
    public var createdAt: Date

    public init(kind: Kind, text: String? = nil, imageFile: String? = nil, createdAt: Date = Date()) {
        self.kind = kind; self.text = text; self.imageFile = imageFile; self.createdAt = createdAt
    }
}

public enum ShareInbox {
    static let fileName = "share-inbox.json"

    public static func containerURL(appGroup: String) -> URL? {
        guard !appGroup.isEmpty else { return nil }
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    public static func write(_ payload: SharePayload, appGroup: String) throws {
        guard let dir = containerURL(appGroup: appGroup) else {
            throw NSError(domain: "ShareInbox", code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group 未配置"])
        }
        let data = try JSONEncoder().encode(payload)
        try data.write(to: dir.appendingPathComponent(fileName), options: .atomic)
    }

    public static func read(appGroup: String) -> SharePayload? {
        guard let dir = containerURL(appGroup: appGroup),
              let data = try? Data(contentsOf: dir.appendingPathComponent(fileName)),
              let p = try? JSONDecoder().decode(SharePayload.self, from: data) else { return nil }
        // 半小时前的旧分享不要突然弹出来
        if Date().timeIntervalSince(p.createdAt) > 30 * 60 { clear(appGroup: appGroup); return nil }
        return p
    }

    public static func clear(appGroup: String) {
        guard let dir = containerURL(appGroup: appGroup) else { return }
        let inbox = dir.appendingPathComponent(fileName)
        if let data = try? Data(contentsOf: inbox), let p = try? JSONDecoder().decode(SharePayload.self, from: data),
           let img = p.imageFile {
            try? FileManager.default.removeItem(at: dir.appendingPathComponent(img))
        }
        try? FileManager.default.removeItem(at: inbox)
    }

    /// 扩展存图用：返回相对文件名
    public static func storeImage(_ data: Data, ext: String, appGroup: String) throws -> String {
        guard let dir = containerURL(appGroup: appGroup) else {
            throw NSError(domain: "ShareInbox", code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group 未配置"])
        }
        let name = "share-\(Int(Date().timeIntervalSince1970)).\(ext)"
        try data.write(to: dir.appendingPathComponent(name), options: .atomic)
        return name
    }

    public static func imageURL(_ file: String, appGroup: String) -> URL? {
        containerURL(appGroup: appGroup)?.appendingPathComponent(file)
    }
}
