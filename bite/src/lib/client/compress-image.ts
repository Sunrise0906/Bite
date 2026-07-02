// 客户端压图：手机原图动辄 4-8MB，而 Vercel serverless 请求体上限 ~4.5MB
// （平台级限制，next.config 的 bodySizeLimit 拦不住平台层）。超阈值的图
// 在浏览器用 canvas 重编码 JPEG（最长边 2048、质量 0.85）后再上传。
// 解码失败（罕见格式）原样返回——宁可上传失败也不阻塞。

const MAX_DIM = 2048;
const JPEG_QUALITY = 0.85;

export async function compressImageIfNeeded(
  file: File,
  maxBytes = 3.5 * 1024 * 1024,
): Promise<File> {
  if (file.size <= maxBytes || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}
