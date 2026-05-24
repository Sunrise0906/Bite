"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { VisitSentiment } from "@/lib/db/types";

export type VisitFormState = {
  error: string | null;
  ok?: boolean;
  /** 递增以触发前端 effect 关闭 modal */
  version?: number;
};

const VALID_SENTIMENTS: VisitSentiment[] = [
  "will_return",
  "okay",
  "wont_return",
];

function normalize(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseStar(formData: FormData): {
  ok: true;
  value: number | null;
} | {
  ok: false;
  error: string;
} {
  const raw = formData.get("star_rating");
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: true, value: null };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { ok: false, error: "星级要在 1-5 之间" };
  }
  return { ok: true, value: n };
}

function parseVisitedAt(formData: FormData): { ok: true; iso: string } | { ok: false; error: string } {
  const raw = normalize(formData.get("visited_at"));
  if (!raw) return { ok: true, iso: new Date().toISOString() };
  // 用户填的是 YYYY-MM-DD（本地）；补 12:00 防止 UTC 偏移到前一天
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { ok: false, error: "日期格式不对" };
  return { ok: true, iso: d.toISOString() };
}

function parseSentiment(formData: FormData):
  | { ok: true; value: VisitSentiment }
  | { ok: false; error: string } {
  const raw = String(formData.get("sentiment") ?? "");
  if (!VALID_SENTIMENTS.includes(raw as VisitSentiment)) {
    return { ok: false, error: "请选择体验评价" };
  }
  return { ok: true, value: raw as VisitSentiment };
}

// ---- 创建 visit log ------------------------------------------------------
export async function logVisit(
  prev: VisitFormState,
  formData: FormData,
): Promise<VisitFormState> {
  const user = await requireUser();

  const placeId = String(formData.get("place_id") ?? "");
  if (!placeId) return { error: "缺少 place_id" };

  const s = parseSentiment(formData);
  if (!s.ok) return { error: s.error };

  const star = parseStar(formData);
  if (!star.ok) return { error: star.error };

  const visitedAt = parseVisitedAt(formData);
  if (!visitedAt.ok) return { error: visitedAt.error };

  const note = normalize(formData.get("note"));
  if (note && note.length > 1000) return { error: "笔记不超过 1000 字" };

  const companions = normalize(formData.get("companions"));
  if (companions && companions.length > 100) {
    return { error: "同行者不超过 100 字" };
  }

  const supabase = await createClient();

  // 拿 list_id 用来 revalidate；同时知道当前 status 决定是否 flip
  const { data: place } = await supabase
    .from("places")
    .select("id, list_id, status")
    .eq("id", placeId)
    .maybeSingle<{ id: string; list_id: string; status: string }>();
  if (!place) return { error: "找不到这家店" };

  const { error: insErr } = await supabase.from("visit_logs").insert({
    place_id: placeId,
    user_id: user.id,
    visited_at: visitedAt.iso,
    sentiment: s.value,
    star_rating: star.value,
    note,
    companions,
  });
  if (insErr) return { error: `记录失败：${insErr.message}` };

  // 首次 / 仍处于 want_to_go：自动 flip 到 visited
  if (place.status === "want_to_go") {
    await supabase
      .from("places")
      .update({ status: "visited" })
      .eq("id", placeId);
  }

  revalidatePath(`/lists/${place.list_id}`);
  revalidatePath(`/lists/${place.list_id}/places/${placeId}/edit`);
  return { error: null, ok: true, version: (prev.version ?? 0) + 1 };
}

// ---- 编辑 visit log -----------------------------------------------------
export async function updateVisit(
  prev: VisitFormState,
  formData: FormData,
): Promise<VisitFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "缺少 log id" };

  const s = parseSentiment(formData);
  if (!s.ok) return { error: s.error };

  const star = parseStar(formData);
  if (!star.ok) return { error: star.error };

  const visitedAt = parseVisitedAt(formData);
  if (!visitedAt.ok) return { error: visitedAt.error };

  const note = normalize(formData.get("note"));
  const companions = normalize(formData.get("companions"));

  const supabase = await createClient();
  const { data: log } = await supabase
    .from("visit_logs")
    .select("place_id, places(list_id)")
    .eq("id", id)
    .maybeSingle<{ place_id: string; places: { list_id: string } | null }>();

  const { error } = await supabase
    .from("visit_logs")
    .update({
      sentiment: s.value,
      star_rating: star.value,
      visited_at: visitedAt.iso,
      note,
      companions,
    })
    .eq("id", id);
  if (error) return { error: `更新失败：${error.message}` };

  if (log?.places?.list_id) {
    revalidatePath(`/lists/${log.places.list_id}`);
    revalidatePath(
      `/lists/${log.places.list_id}/places/${log.place_id}/edit`,
    );
  }
  return { error: null, ok: true, version: (prev.version ?? 0) + 1 };
}

// ---- 删除 visit log -----------------------------------------------------
export async function deleteVisit(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/lists?error=missing_id");

  const supabase = await createClient();
  const { data: log } = await supabase
    .from("visit_logs")
    .select("place_id, places(list_id)")
    .eq("id", id)
    .maybeSingle<{ place_id: string; places: { list_id: string } | null }>();

  const { error } = await supabase.from("visit_logs").delete().eq("id", id);
  if (error) {
    redirect(`/lists?error=${encodeURIComponent(error.message)}`);
  }

  if (log?.places?.list_id) {
    revalidatePath(`/lists/${log.places.list_id}`);
    revalidatePath(
      `/lists/${log.places.list_id}/places/${log.place_id}/edit`,
    );
  }
}
