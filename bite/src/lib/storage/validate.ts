// Pure helpers for client-uploaded image validation。
// 不引 next/server/supabase，纯函数好测；photos.ts Server Action 复用。

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_PHOTO_MIME = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export const ALLOWED_PHOTO_EXT = new Set<string>([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
]);

// mime → 标准扩展名（fallback：当文件名没扩展时用）
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export type PhotoFileMeta = {
  size: number;
  type: string;
  name: string;
};

export type ValidatePhotoResult =
  | { ok: true; ext: string; sanitizedBase: string }
  | { ok: false; error: string };

/**
 * 从文件名取小写扩展名；没有就 return 空串。
 */
export function extOf(name: string, mime: string): string {
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  if (m) {
    const fromName = m[1].toLowerCase();
    if (ALLOWED_PHOTO_EXT.has(fromName)) return fromName;
  }
  const fromMime = MIME_TO_EXT[mime];
  if (fromMime) return fromMime;
  return "";
}

/**
 * 把文件名（不含扩展名）洗成 fs-safe slug。
 * - 去掉路径分隔符
 * - 仅保留 [a-zA-Z0-9._-]，其他变 -
 * - 收敛连续 -
 * - 截到 40 字符
 * - 空 → 'photo'
 */
export function sanitizeBase(name: string): string {
  if (!name) return "photo";
  // 先剥掉可能的扩展名段
  const withoutExt = name.replace(/\.[^.]+$/, "");
  const cleaned = withoutExt
    .replace(/[\\/]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const truncated = cleaned.slice(0, 40);
  return truncated.length > 0 ? truncated : "photo";
}

/**
 * 主校验：大小、MIME、扩展名。所有错误信息中文，直接面向用户。
 */
export function validatePhotoFile(meta: PhotoFileMeta): ValidatePhotoResult {
  if (!meta || typeof meta.size !== "number") {
    return { ok: false, error: "缺少文件" };
  }
  if (meta.size <= 0) {
    return { ok: false, error: "文件为空" };
  }
  if (meta.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "图片不能超过 10MB" };
  }
  if (!meta.type || !meta.type.startsWith("image/")) {
    return { ok: false, error: "只允许图片文件" };
  }
  if (!ALLOWED_PHOTO_MIME.has(meta.type)) {
    return { ok: false, error: "仅支持 JPG / PNG / WebP / GIF / HEIC" };
  }
  const ext = extOf(meta.name ?? "", meta.type);
  if (!ext) {
    return { ok: false, error: "无法识别图片格式" };
  }
  const sanitizedBase = sanitizeBase(meta.name ?? "");
  return { ok: true, ext, sanitizedBase };
}
