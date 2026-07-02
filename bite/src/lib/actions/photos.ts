"use server";

import { randomUUID } from "node:crypto";
import { createClient, requireUser } from "@/lib/supabase/server";
import { validatePhotoFile } from "@/lib/storage/validate";
import { PHOTO_URL_TTL_SEC } from "@/lib/storage/signed-photos";

export type UploadPhotoResult =
  | {
      ok: true;
      /** canonical URL（落库用的稳定标识；bucket 私有后不能直接访问） */
      public_url: string;
      /** 展示用 signed URL（表单里即时预览）；签名失败时同 public_url */
      display_url: string;
      path: string;
    }
  | { ok: false; error: string };

/**
 * 上传一张图到 Storage bucket 'photos'。
 *
 * - 文件取自 formData.get('file')
 * - 校验大小 / MIME / 扩展名（详见 @/lib/storage/validate）
 * - 路径：<userId>/<server-epoch>-<uuid8>-<sanitizedName>.<ext>
 *   RLS 要求第一段目录 = auth.uid()::text
 * - 返回 public URL（bucket 是 public）
 *
 * 故意不写 places / visit_logs：客户端拿到 URL 后追加到原表单字段，
 * 走原有 Server Action 落库，保持单一写路径。
 */
export async function uploadPhoto(
  formData: FormData,
): Promise<UploadPhotoResult> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "缺少文件" };
  }

  const validation = validatePhotoFile({
    size: file.size,
    type: file.type,
    name: file.name,
  });
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // 服务端取时间戳 + 短随机串，避免同毫秒并发碰撞
  const ts = Date.now();
  const rand = randomUUID().slice(0, 8);
  const path = `${user.id}/${ts}-${rand}-${validation.sanitizedBase}.${validation.ext}`;

  const supabase = await createClient();
  const { error: uploadErr } = await supabase.storage
    .from("photos")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });

  if (uploadErr) {
    return { ok: false, error: `上传失败：${uploadErr.message}` };
  }

  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  if (!data?.publicUrl) {
    return { ok: false, error: "拿不到 public URL" };
  }

  // bucket 私有后 public URL 打不开，预览要用 signed URL；失败回退（public 时照常）
  let displayUrl = data.publicUrl;
  const { data: signed } = await supabase.storage
    .from("photos")
    .createSignedUrl(path, PHOTO_URL_TTL_SEC);
  if (signed?.signedUrl) displayUrl = signed.signedUrl;

  return { ok: true, public_url: data.publicUrl, display_url: displayUrl, path };
}

/**
 * 删图：RLS 保证只能删 <自己 uid>/... 下的文件。
 * 客户端 v1 仅从 URL 列表移除、不调本接口（保留 orphan 留待后续清理）；
 * 此处先实现以便后续使用。
 */
export async function deletePhoto(
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  if (typeof path !== "string" || path.trim() === "") {
    return { ok: false, error: "缺少 path" };
  }
  const supabase = await createClient();
  const { error } = await supabase.storage.from("photos").remove([path]);
  if (error) {
    return { ok: false, error: `删除失败：${error.message}` };
  }
  return { ok: true };
}
