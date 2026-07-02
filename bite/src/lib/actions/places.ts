"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { normalizePhotoUrl } from "@/lib/storage/signed-photos";
import type { PlacePrice, PlaceStatus } from "@/lib/db/types";

export type PlaceFormState = {
  error: string | null;
};

const VALID_STATUS: PlaceStatus[] = ["want_to_go", "visited", "archived"];
const VALID_PRICE: PlacePrice[] = ["$", "$$", "$$$", "$$$$"];

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseStatus(raw: FormDataEntryValue | null): PlaceStatus {
  return VALID_STATUS.includes(raw as PlaceStatus)
    ? (raw as PlaceStatus)
    : "want_to_go";
}

function parsePrice(raw: FormDataEntryValue | null): PlacePrice | null {
  if (typeof raw !== "string" || raw === "") return null;
  return VALID_PRICE.includes(raw as PlacePrice) ? (raw as PlacePrice) : null;
}

// ---- 新建 place ---------------------------------------------------------
export async function createPlace(
  _prev: PlaceFormState,
  formData: FormData,
): Promise<PlaceFormState> {
  const user = await requireUser();
  const listId = String(formData.get("list_id") ?? "");
  if (!listId) return { error: "缺少 list id" };

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const cuisine = parseTags(formData.get("cuisine"));

  if (!name) return { error: "请填写店名" };
  if (!address) return { error: "请填写地址" };
  if (cuisine.length === 0) return { error: "请填写至少一个菜系标签" };

  const status = parseStatus(formData.get("status"));
  const priceRange = parsePrice(formData.get("price_range"));
  const occasions = parseTags(formData.get("occasions"));
  const tags = parseTags(formData.get("tags"));
  const recommendedBy =
    String(formData.get("recommended_by") ?? "").trim() || null;
  const reasonText = String(formData.get("reason") ?? "").trim();

  const reasons = reasonText
    ? [{ user_id: user.id, text: reasonText }]
    : [];
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const photoUrls = String(formData.get("photo_urls_text") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    // 用户从页面复制到的自家图是 7 天 signed URL，落库前转回 canonical
    .map((s) => normalizePhotoUrl(s));

  const supabase = await createClient();
  const { error } = await supabase
    .from("places")
    .insert({
      list_id: listId,
      name,
      address,
      cuisine,
      price_range: priceRange,
      status,
      occasions,
      recommended_by: recommendedBy,
      tags,
      reasons,
      notes,
      photo_urls: photoUrls,
      source: "manual",
      created_by: user.id,
    });

  if (error) return { error: `保存失败：${error.message}` };

  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}?toast=place_added`);
}

// ---- 更新 place ---------------------------------------------------------
export async function updatePlace(
  _prev: PlaceFormState,
  formData: FormData,
): Promise<PlaceFormState> {
  const user = await requireUser();
  const placeId = String(formData.get("place_id") ?? "");
  const listId = String(formData.get("list_id") ?? "");
  if (!placeId || !listId) return { error: "缺少必要参数" };

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const cuisine = parseTags(formData.get("cuisine"));

  if (!name) return { error: "请填写店名" };
  if (!address) return { error: "请填写地址" };
  if (cuisine.length === 0) return { error: "请填写至少一个菜系标签" };

  const notesRaw = formData.get("notes");
  const photoRaw = formData.get("photo_urls_text");
  const supabase = await createClient();
  const { error } = await supabase
    .from("places")
    .update({
      name,
      address,
      cuisine,
      price_range: parsePrice(formData.get("price_range")),
      status: parseStatus(formData.get("status")),
      occasions: parseTags(formData.get("occasions")),
      tags: parseTags(formData.get("tags")),
      recommended_by:
        String(formData.get("recommended_by") ?? "").trim() || null,
      // notes / photo_urls 不在表单时不动；空字符串 → 清空
      ...(notesRaw !== null
        ? { notes: String(notesRaw).trim() || null }
        : {}),
      ...(photoRaw !== null
        ? {
            photo_urls: String(photoRaw)
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => normalizePhotoUrl(s)),
          }
        : {}),
    })
    .eq("id", placeId);

  if (error) return { error: `保存失败：${error.message}` };

  // 单独处理 reasons：v1 用户只能改 / 删自己的那一条。
  // 失败不阻断（主字段已保存成功），留痕排查
  const reasonText = String(formData.get("reason") ?? "").trim();
  const reasonSync = await syncOwnReason(placeId, user.id, reasonText);
  if (reasonSync.error) {
    console.error(`updatePlace: 主字段已保存但 reason 同步失败（place=${placeId}）：${reasonSync.error}`);
  }

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/places/${placeId}/edit`);
  redirect(`/lists/${listId}?toast=place_updated`);
}

async function syncOwnReason(
  placeId: string,
  userId: string,
  newText: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error: selErr } = await supabase
    .from("places")
    .select("reasons")
    .eq("id", placeId)
    .single();
  // select 失败时不能拿空数组当现状覆盖回去——会把所有人的 reason 清掉
  if (selErr) return { error: selErr.message };

  const existing: Array<{ user_id: string; text: string }> =
    Array.isArray(data?.reasons) ? data.reasons : [];

  const next = existing.filter((r) => r.user_id !== userId);
  if (newText) next.push({ user_id: userId, text: newText });

  const { error: updErr } = await supabase
    .from("places")
    .update({ reasons: next })
    .eq("id", placeId);
  if (updErr) return { error: updErr.message };
  return {};
}

// ---- 快速改 place 状态（卡片上一键切换）--------------------------------
export async function updatePlaceStatus(
  placeId: string,
  listId: string,
  next: PlaceStatus,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  if (!VALID_STATUS.includes(next)) return { ok: false, error: "无效状态" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("places")
    .update({ status: next })
    .eq("id", placeId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

// ---- 删除 place ---------------------------------------------------------
export async function deletePlace(formData: FormData): Promise<void> {
  await requireUser();
  const placeId = String(formData.get("place_id") ?? "");
  const listId = String(formData.get("list_id") ?? "");
  if (!placeId || !listId) redirect("/lists");

  const supabase = await createClient();
  const { error } = await supabase
    .from("places")
    .delete()
    .eq("id", placeId);

  if (error) {
    redirect(
      `/lists/${listId}?error=${encodeURIComponent(`删除失败：${error.message}`)}`,
    );
  }

  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}?toast=place_deleted`);
}
