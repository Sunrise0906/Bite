"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const { data, error } = await supabase
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
      source: "manual",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: `保存失败：${error.message}` };

  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}`);
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
    })
    .eq("id", placeId);

  if (error) return { error: `保存失败：${error.message}` };

  // 单独处理 reasons：v1 用户只能改 / 删自己的那一条
  const reasonText = String(formData.get("reason") ?? "").trim();
  await syncOwnReason(placeId, user.id, reasonText);

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/places/${placeId}/edit`);
  redirect(`/lists/${listId}`);
}

async function syncOwnReason(
  placeId: string,
  userId: string,
  newText: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("reasons")
    .eq("id", placeId)
    .single();

  const existing: Array<{ user_id: string; text: string }> =
    Array.isArray(data?.reasons) ? data.reasons : [];

  const next = existing.filter((r) => r.user_id !== userId);
  if (newText) next.push({ user_id: userId, text: newText });

  await supabase.from("places").update({ reasons: next }).eq("id", placeId);
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
  redirect(`/lists/${listId}`);
}
