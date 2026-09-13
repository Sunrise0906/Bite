"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { normalizePhotoUrl } from "@/lib/storage/signed-photos";
import { deleteTier, upsertTier } from "@/lib/db/ratings";
import { parseTier } from "@/lib/places/tier";
import {
  normalize,
  parseSentiment,
  parseStar,
  parseVisitedAt,
} from "@/lib/visits/parse";

export type VisitFormState = {
  error: string | null;
  ok?: boolean;
  /** 递增以触发前端 effect 关闭 modal */
  version?: number;
};

// 与 places.ts 的 photo_urls_text 解析对齐：split \n、trim、保留 https://。
// normalizePhotoUrl：用户从页面复制到的自家图是 7 天 signed URL，落库前转回 canonical
function parsePhotosText(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
    .map((s) => normalizePhotoUrl(s));
}

/**
 * 顺手更新档位（sql/0028）—— 造访表单里那一栏「这家几档」。
 *
 * 三态，与本文件 photos_text 的口径一致：
 *   - 表单里**没有** tier 字段  → 什么都不做（编辑老记录的表单就是这种）
 *   - tier 是合法档位          → upsert
 *   - tier 是空串              → 用户刚刚清空了 → 删掉自己那条
 *
 * ⚠️ 「字段不在」和「字段为空」必须分开：混为一谈的话，任何一个不带 tier 的
 * 调用方都会把用户已有的档位静默删掉。
 *
 * ⚠️ best-effort：失败只留痕不阻断 —— 造访本身已经写成功了，为了一个附带字段
 * 把整次记录退回去更糟（同本文件 status 翻转失败的处理）。用户在清单卡片 /
 * 详情页点评价时会拿到明确报错，那两条路是有回显的。
 */
async function applyTierFromForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  args: { placeId: string; listId: string; userId: string },
): Promise<void> {
  if (!formData.has("tier")) return;
  const tier = parseTier(formData.get("tier"));
  const r = tier
    ? await upsertTier(supabase, { ...args, tier })
    : await deleteTier(supabase, { placeId: args.placeId, userId: args.userId });
  if ("error" in r) {
    console.error(
      `visits: 造访已记录但档位没写进去（place=${args.placeId}）：${r.error}`,
    );
  }
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

  const photos = parsePhotosText(formData.get("photos_text"));

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
    photos,
  });
  if (insErr) return { error: `记录失败：${insErr.message}` };

  await applyTierFromForm(supabase, formData, {
    placeId,
    listId: place.list_id,
    userId: user.id,
  });

  // 首次 / 仍处于 want_to_go：自动 flip 到 visited。
  // 失败不阻断（visit 本身已记录成功），但留痕便于排查状态不同步
  if (place.status === "want_to_go") {
    const { error: flipErr } = await supabase
      .from("places")
      .update({ status: "visited" })
      .eq("id", placeId);
    if (flipErr) {
      console.error(`logVisit: visit 已记录但状态翻转失败（place=${placeId}）：${flipErr.message}`);
    }
  }

  revalidatePath(`/lists/${place.list_id}`);
  revalidatePath(`/lists/${place.list_id}/places/${placeId}`);
  revalidatePath(`/lists/${place.list_id}/places/${placeId}/edit`);
  return { error: null, ok: true, version: (prev.version ?? 0) + 1 };
}

// ---- 编辑 visit log -----------------------------------------------------
export async function updateVisit(
  prev: VisitFormState,
  formData: FormData,
): Promise<VisitFormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "缺少 log id" };

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

  // photos_text 不在表单时不动；空字符串 → 清空
  const photosRaw = formData.get("photos_text");
  const photosUpdate =
    photosRaw !== null ? { photos: parsePhotosText(photosRaw) } : {};

  const supabase = await createClient();
  const { data: log } = await supabase
    .from("visit_logs")
    .select("place_id, places(list_id)")
    .eq("id", id)
    .maybeSingle<{ place_id: string; places: { list_id: string } | null }>();

  // 显式作用域 + RLS 双保险：拿别人的 id 时 0 行命中，返回明确错误而不是假成功
  const { data: updated, error } = await supabase
    .from("visit_logs")
    .update({
      sentiment: s.value,
      star_rating: star.value,
      visited_at: visitedAt.iso,
      note,
      companions,
      ...photosUpdate,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return { error: `更新失败：${error.message}` };
  if (!updated || updated.length === 0) {
    return { error: "未找到这条记录或无权限编辑" };
  }

  if (log?.places?.list_id) {
    // 编辑表单默认**不带** tier 字段（调用方不知道当前档位），所以这里通常是 no-op。
    // 见 applyTierFromForm 的三态说明。
    await applyTierFromForm(supabase, formData, {
      placeId: log.place_id,
      listId: log.places.list_id,
      userId: user.id,
    });
    revalidatePath(`/lists/${log.places.list_id}`);
    revalidatePath(
      `/lists/${log.places.list_id}/places/${log.place_id}/edit`,
    );
  }
  return { error: null, ok: true, version: (prev.version ?? 0) + 1 };
}

// ---- 删除 visit log -----------------------------------------------------
export async function deleteVisit(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/lists?error=missing_id");

  const supabase = await createClient();
  const { data: log } = await supabase
    .from("visit_logs")
    .select("place_id, places(list_id)")
    .eq("id", id)
    .maybeSingle<{ place_id: string; places: { list_id: string } | null }>();

  // 显式作用域 + select 让 RLS 拦截能被识别为"未命中"而非"假成功"
  const { data: deleted, error } = await supabase
    .from("visit_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) {
    redirect(`/lists?error=${encodeURIComponent(error.message)}`);
  }
  if (!deleted || deleted.length === 0) {
    redirect(
      `/lists?error=${encodeURIComponent("未找到这条记录或无权限删除")}`,
    );
  }

  if (log?.places?.list_id) {
    revalidatePath(`/lists/${log.places.list_id}`);
    revalidatePath(
      `/lists/${log.places.list_id}/places/${log.place_id}/edit`,
    );
  }
}
