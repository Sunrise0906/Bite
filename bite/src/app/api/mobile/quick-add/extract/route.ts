// POST /api/mobile/quick-add/extract —— iOS 的智能添加第一步。
// 文本 / 小红书链接 / 照片 → 抓取 + AI 抽取，返回候选店（不落草稿表，App 在内存里走确认流程）。
// 核心逻辑与网页共用：lib/places/quick-add-core.ts。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import {
  buildImageDraft,
  buildTextDraft,
  serializeDraft,
} from "@/lib/places/quick-add-core";
import { validatePhotoFile } from "@/lib/storage/validate";

export const runtime = "nodejs";

type Body = {
  text?: unknown;
  image?: { base64?: unknown; mime_type?: unknown; name?: unknown } | null;
  hint?: unknown;
  target_list_id?: unknown;
};

export const POST = mobileRoute(async ({ req, scope }) => {
  const body = await readJsonBody<Body>(req);
  const targetListId = str(body.target_list_id, 64) || undefined;

  const img = body.image && typeof body.image === "object" ? body.image : null;
  if (img && typeof img.base64 === "string" && img.base64.length > 0) {
    const mimeType = str(img.mime_type, 64) || "image/jpeg";
    const buffer = Buffer.from(img.base64, "base64");
    const validation = validatePhotoFile({
      size: buffer.byteLength,
      type: mimeType,
      name: str(img.name, 200) || "photo",
    });
    if (!validation.ok) return jsonError(validation.error);
    const built = await buildImageDraft(
      scope.supabase,
      scope.user.id,
      { buffer, mimeType, ext: validation.ext },
      str(body.hint, 500),
      targetListId,
    );
    if (!built.ok) return jsonError(built.error, 422);
    return jsonOk(serializeDraft(built.draft));
  }

  const text = str(body.text, 10000);
  if (!text) return jsonError("请输入要识别的内容");
  const built = await buildTextDraft(scope.supabase, text, targetListId);
  if (!built.ok) return jsonError(built.error, 422);
  return jsonOk(serializeDraft(built.draft));
});
