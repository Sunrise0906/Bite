// 小红书图片转存：XHS CDN 的图片 URL 自带时间戳、几周内过期 + 防盗链 403，
// 直接存外链会"图片腐烂"。保存店铺时把 XHS 域的图下载转存到自己的 photos
// bucket（存 canonical URL，展示层照常签名）。失败一律回退原 URL，绝不阻塞保存。

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const MIRROR_HOST_RE = /(^|\.)((xhscdn|xiaohongshu)\.com)$/i;
const MAX_BYTES = 10 * 1024 * 1024; // 与 bucket 上限一致
const FETCH_TIMEOUT_MS = 8000;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** 只转存小红书 CDN 域的 http(s) 图；其他外链（用户有意贴的图床）不动 */
export function shouldMirrorPhotoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return MIRROR_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

/** content-type → 存储扩展名；不认识的图类型返回 null（跳过转存） */
export function extForContentType(ct: string | null): string | null {
  if (!ct) return null;
  const mime = ct.split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[mime] ?? null;
}

async function mirrorOne(
  supabase: SupabaseClient,
  userId: string,
  url: string,
): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // 不带 referer：XHS CDN 对空 referer 反而更宽容
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return url;
    const ext = extForContentType(res.headers.get("content-type"));
    if (!ext) return url;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return url;

    // 路径 = 内容哈希：同一张图重复保存（比如二刷同一篇帖子）落到同一对象，
    // 得到同一 canonical URL → 合并去重（unionStrings）能正确工作，不会图片翻倍
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 20);
    const path = `${userId}/xhs-${hash}.${ext}`;
    const { error } = await supabase.storage.from("photos").upload(path, buf, {
      contentType: res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg",
      upsert: true, // 内容寻址，重传等价
      cacheControl: "31536000", // 转存后内容不可变
    });
    if (error) return url;

    const { data } = supabase.storage.from("photos").getPublicUrl(path);
    return data?.publicUrl ?? url;
  } catch {
    return url;
  }
}

/**
 * 批量转存：仅处理 shouldMirrorPhotoUrl 命中的 URL，其余原样返回。
 * 顺序与入参一一对应（合集帖的 photo_indices 依赖顺序）。
 */
export async function mirrorPhotosToStorage(
  supabase: SupabaseClient,
  userId: string,
  urls: string[],
): Promise<string[]> {
  return Promise.all(
    urls.map((u) => (shouldMirrorPhotoUrl(u) ? mirrorOne(supabase, userId, u) : u)),
  );
}
