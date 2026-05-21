"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  extractPlaceFromText,
  type ExtractedPlace,
} from "@/lib/llm/extract-place";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { PlacePrice, PlaceStatus } from "@/lib/db/types";

const DRAFT_COOKIE = "bite_quick_add_draft";
const DRAFT_TTL_SECONDS = 600;

export type QuickAddDraft = {
  rawInput: string;
  extracted: ExtractedPlace;
};

export type QuickAddFormState = {
  error: string | null;
};

// ---- 入口 1：自由文本 / 小红书正文 → AI 提取 → 暂存 → 跳转确认页 ----
export async function processTextDraft(
  _prev: QuickAddFormState,
  formData: FormData,
): Promise<QuickAddFormState> {
  await requireUser();
  const text = String(formData.get("text") ?? "").trim();

  if (!text) return { error: "请输入要识别的内容" };

  const result = await extractPlaceFromText(text);
  if (!result.ok) return { error: result.error };

  const draft: QuickAddDraft = { rawInput: text, extracted: result.data };
  const cookieStore = await cookies();
  cookieStore.set(DRAFT_COOKIE, JSON.stringify(draft), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DRAFT_TTL_SECONDS,
    path: "/",
  });

  redirect("/quick-add?source=text");
}

// ---- 读 draft（供 /quick-add 页面用）----
export async function readDraft(): Promise<QuickAddDraft | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DRAFT_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw.value) as QuickAddDraft;
  } catch {
    return null;
  }
}

export async function clearDraft() {
  const cookieStore = await cookies();
  cookieStore.delete(DRAFT_COOKIE);
}

// ---- 入口 2：用户在确认页提交表单 → 写入 places 表 ----
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

const SOURCE_VALUES = [
  "manual",
  "xhs",
  "ai_extract",
  "google_places",
  "yelp",
] as const;
type SourceValue = (typeof SOURCE_VALUES)[number];

function parseSource(raw: FormDataEntryValue | null): SourceValue {
  return SOURCE_VALUES.includes(raw as SourceValue)
    ? (raw as SourceValue)
    : "manual";
}

export async function savePlaceFromDraft(
  _prev: QuickAddFormState,
  formData: FormData,
): Promise<QuickAddFormState> {
  const user = await requireUser();

  const listId = String(formData.get("list_id") ?? "");
  if (!listId) return { error: "请选择要添加到的 list" };

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const cuisine = parseTags(formData.get("cuisine"));

  if (!name) return { error: "店名不能为空" };
  if (!address) return { error: "地址不能为空" };
  if (cuisine.length === 0) return { error: "请填写至少一个菜系标签" };

  const source = parseSource(formData.get("source"));
  const sourceUrl = String(formData.get("source_url") ?? "").trim() || null;
  const googlePlaceId =
    String(formData.get("google_place_id") ?? "").trim() || null;
  const latRaw = String(formData.get("lat") ?? "").trim();
  const lngRaw = String(formData.get("lng") ?? "").trim();
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;

  const reasonText = String(formData.get("reason") ?? "").trim();
  const reasons = reasonText
    ? [{ user_id: user.id, text: reasonText }]
    : [];

  const supabase = await createClient();
  const { error } = await supabase.from("places").insert({
    list_id: listId,
    name,
    address,
    cuisine,
    price_range: parsePrice(formData.get("price_range")),
    status: parseStatus(formData.get("status")),
    occasions: parseTags(formData.get("occasions")),
    tags: parseTags(formData.get("tags")),
    recommended_by:
      String(formData.get("recommended_by") ?? "").trim() || null,
    reasons,
    source,
    source_url: sourceUrl,
    google_place_id: googlePlaceId,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    created_by: user.id,
  });

  if (error) return { error: `保存失败：${error.message}` };

  await clearDraft();
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}`);
}

// ---- 取消：清 draft 跳回 /lists ----
export async function cancelQuickAdd() {
  await clearDraft();
  redirect("/lists");
}
