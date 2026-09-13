import Foundation

/// photos bucket 私有化后的 URL 约定（bite/src/lib/storage/signed-photos.ts）。
///
/// DB 里永远存 canonical URL（…/storage/v1/object/public/photos/<path>）——它是稳定标识符，
/// 直接访问会 400；展示时换成短期 signed URL。App 从页面复制到的是 signed URL，
/// 落库前必须转回 canonical，否则 7 天后图片永久失效。
public enum PhotoURL {
    static let publicMarker = "/storage/v1/object/public/photos/"
    static let signMarker = "/storage/v1/object/sign/photos/"

    /// signed URL 有效期：7 天
    public static let ttlSeconds = 60 * 60 * 24 * 7

    /// 写库前的归一化：signed → canonical；外链和 canonical 原样返回
    public static func normalize(_ url: String, supabaseURL: String) -> String {
        guard !supabaseURL.isEmpty, url.hasPrefix(supabaseURL), let r = url.range(of: signMarker) else { return url }
        let rawPath = url[r.upperBound...].split(whereSeparator: { $0 == "?" || $0 == "#" }).first.map(String.init) ?? ""
        guard !rawPath.isEmpty else { return url }
        return supabaseURL + publicMarker + rawPath
    }

    /// canonical URL → bucket 内的对象 path（外链 → nil）
    public static func objectPath(_ url: String, supabaseURL: String) -> String? {
        guard !supabaseURL.isEmpty, url.hasPrefix(supabaseURL), let r = url.range(of: publicMarker) else { return nil }
        let raw = url[r.upperBound...].split(whereSeparator: { $0 == "?" || $0 == "#" }).first.map(String.init) ?? ""
        guard !raw.isEmpty else { return nil }
        return raw.removingPercentEncoding ?? raw
    }

    /// 自家 Storage 图的 canonical URL（对象 path → URL）
    public static func canonical(path: String, supabaseURL: String) -> String {
        let encoded = path.split(separator: "/").map {
            String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0)
        }.joined(separator: "/")
        return supabaseURL + publicMarker + encoded
    }

    /// 上传路径：<uid>/<epoch>-<rand>-<sanitized>.<ext>（RLS 要求第一段目录 = auth.uid()）
    public static func uploadPath(userId: String, originalName: String, ext: String, now: Date = Date()) -> String {
        let ts = Int(now.timeIntervalSince1970 * 1000)
        let rand = String(UUID().uuidString.lowercased().prefix(8))
        return "\(userId)/\(ts)-\(rand)-\(sanitizeBase(originalName)).\(ext)"
    }

    /// 文件名（不含扩展名）洗成 fs-safe slug（bite/src/lib/storage/validate.ts 的 sanitizeBase）
    public static func sanitizeBase(_ name: String) -> String {
        guard !name.isEmpty else { return "photo" }
        var base = name
        if let dot = base.lastIndex(of: "."), dot != base.startIndex { base = String(base[..<dot]) }
        let allowed = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
        var out = ""
        var lastDash = false
        for ch in base {
            if ch == "/" || ch == "\\" { continue }
            if allowed.contains(ch) {
                out.append(ch); lastDash = false
            } else if !lastDash {
                out.append("-"); lastDash = true
            }
        }
        while let f = out.first, f == "-" || f == "." { out.removeFirst() }
        while let l = out.last, l == "-" || l == "." { out.removeLast() }
        let truncated = String(out.prefix(40))
        return truncated.isEmpty ? "photo" : truncated
    }

    public static let maxBytes = 10 * 1024 * 1024
    public static let allowedMime: Set<String> = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]

    public static func ext(forMime mime: String) -> String? {
        switch mime {
        case "image/jpeg": return "jpg"
        case "image/png": return "png"
        case "image/webp": return "webp"
        case "image/gif": return "gif"
        case "image/heic": return "heic"
        case "image/heif": return "heif"
        default: return nil
        }
    }
}
