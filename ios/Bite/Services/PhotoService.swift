import Foundation
import UIKit
import Supabase
import BiteCore

/// 照片：上传到 Storage bucket `photos`（RLS 只允许写自己的 <uid>/ 目录），
/// DB 里存 canonical URL，展示时换 7 天 signed URL（bucket 是私有的）。
final class PhotoService {
    let client: SupabaseClient
    let supabaseURL: String

    init(client: SupabaseClient, supabaseURL: String) {
        self.client = client
        self.supabaseURL = supabaseURL
    }

    /// canonical → signed 的映射（只含自家 Storage 的 URL；外链不在里面）。任何失败都退回原 URL（不抛）。
    func signedMap(for urls: [String]) async -> [String: String] {
        var pathByUrl: [String: String] = [:]
        for u in urls {
            if pathByUrl[u] == nil, let p = PhotoURL.objectPath(u, supabaseURL: supabaseURL) { pathByUrl[u] = p }
        }
        guard !pathByUrl.isEmpty else { return [:] }
        let urlsOrdered = Array(pathByUrl.keys)
        let paths = urlsOrdered.map { pathByUrl[$0]! }
        do {
            let results = try await client.storage.from("photos").createSignedURLs(paths: paths, expiresIn: PhotoURL.ttlSeconds)
            var out: [String: String] = [:]
            for (i, r) in results.enumerated() where i < urlsOrdered.count {
                if let signed = r.signedURL { out[urlsOrdered[i]] = signed.absoluteString }
            }
            return out
        } catch {
            return [:]
        }
    }

    /// 把一组 URL 换成可展示的（签名过的自家图 + 原样外链）
    func displayURLs(_ urls: [String]) async -> [String] {
        let map = await signedMap(for: urls)
        return urls.map { map[$0] ?? $0 }
    }

    struct Uploaded {
        var canonical: String
        var display: String
    }

    /// 上传一张图（已经是 JPEG/PNG 的 Data）
    func upload(data: Data, mime: String, originalName: String, userId: String) async throws -> Uploaded {
        guard data.count > 0 else { throw PhotoError.empty }
        guard data.count <= PhotoURL.maxBytes else { throw PhotoError.tooLarge }
        guard let ext = PhotoURL.ext(forMime: mime) else { throw PhotoError.unsupported }
        let path = PhotoURL.uploadPath(userId: userId, originalName: originalName, ext: ext)
        _ = try await client.storage.from("photos").upload(
            path, data: data,
            options: FileOptions(cacheControl: "3600", contentType: mime, upsert: false)
        )
        let canonical = PhotoURL.canonical(path: path, supabaseURL: supabaseURL)
        let signed = try? await client.storage.from("photos").createSignedURL(path: path, expiresIn: PhotoURL.ttlSeconds)
        return Uploaded(canonical: canonical, display: signed?.absoluteString ?? canonical)
    }

    /// 手机原图动辄 4-8MB；Vercel 请求体上限 ~4.5MB。超阈值就重编码 JPEG（最长边 2048、质量 0.85）。
    /// 移植自 bite/src/lib/client/compress-image.ts
    static func jpegData(from image: UIImage, maxBytes: Int = 3_500_000, maxDim: CGFloat = 2048, quality: CGFloat = 0.85) -> Data? {
        let scale = min(1, maxDim / max(image.size.width, image.size.height))
        let target = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        var q = quality
        var data = resized.jpegData(compressionQuality: q)
        while let d = data, d.count > maxBytes, q > 0.4 {
            q -= 0.15
            data = resized.jpegData(compressionQuality: q)
        }
        return data
    }

    enum PhotoError: LocalizedError {
        case empty, tooLarge, unsupported
        var errorDescription: String? {
            switch self {
            case .empty: return "文件为空"
            case .tooLarge: return "图片不能超过 10MB"
            case .unsupported: return "仅支持 JPG / PNG / WebP / GIF / HEIC"
            }
        }
    }
}
