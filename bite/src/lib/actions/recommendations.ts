"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Place, PlacePrice } from "@/lib/db/types";

// 推荐时快照下来的字段（不要带 user-specific 的 reasons / id / list_id）
export type SnapshottedPlace = {
  name: string;
  address: string;
  cuisine: string[];
  price_range: PlacePrice | null;
  occasions: string[];
  recommended_by: string | null;
  tags: string[];
  notes: string | null;
  source: string;
  source_url: string | null;
  photo_urls: string[];
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  /** 发送者一句话理由（会成为接收者的 reasons[0]） */
  message: string | null;
  /** 发送者 user_id，UI 上能显示头像/名字 */
  from_user_id: string;
};

export type SendRecResult =
  | { ok: true; recipient_email: string }
  | { error: string };

export async function sendRecommendation(args: {
  to_email: string;
  place_id: string;
  message?: string;
}): Promise<SendRecResult> {
  const user = await requireUser();
  const toEmail = args.to_email.trim().toLowerCase();
  if (!toEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(toEmail)) {
    return { error: "邮箱格式不对" };
  }
  if (!args.place_id) return { error: "缺少 place_id" };
  const message = args.message?.trim().slice(0, 200) || null;

  const supabase = await createClient();

  // 1. 找朋友 profile
  const { data: recipient } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", toEmail)
    .maybeSingle<{ id: string; email: string }>();
  if (!recipient) {
    return {
      error: "找不到这个邮箱对应的用户。让朋友先注册 Bite 再试。",
    };
  }
  if (recipient.id === user.id) {
    return { error: "不能推荐给自己" };
  }

  // 2. 拿源 place
  const { data: place } = await supabase
    .from("places")
    .select(
      "name, address, cuisine, price_range, occasions, tags, recommended_by, notes, source, source_url, photo_urls, lat, lng, google_place_id",
    )
    .eq("id", args.place_id)
    .maybeSingle<Place>();
  if (!place) return { error: "找不到这家店" };

  // 3. 拿发送者名字用于 recommended_by 字段
  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle<{ name: string | null; email: string }>();
  const senderLabel =
    senderProfile?.name ?? senderProfile?.email.split("@")[0] ?? "朋友";

  const snapshot: SnapshottedPlace = {
    name: place.name,
    address: place.address,
    cuisine: place.cuisine ?? [],
    price_range: place.price_range ?? null,
    occasions: place.occasions ?? [],
    recommended_by: `@${senderLabel}`,
    tags: place.tags ?? [],
    notes: place.notes ?? null,
    source: place.source ?? "manual",
    source_url: place.source_url ?? null,
    photo_urls: place.photo_urls ?? [],
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    google_place_id: place.google_place_id ?? null,
    message,
    from_user_id: user.id,
  };

  // 4. 防重复：同一个发送者 + 接收者 + 店名 + pending 状态只允许一条
  const { data: existing } = await supabase
    .from("recommendations")
    .select("id")
    .eq("from_user_id", user.id)
    .eq("to_user_id", recipient.id)
    .eq("status", "pending")
    .eq("place_data->>name", place.name)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return { error: "你已经推荐过这家店给 ta 了（还没处理）" };
  }

  // 5. 插入
  const { error } = await supabase.from("recommendations").insert({
    from_user_id: user.id,
    to_user_id: recipient.id,
    place_data: snapshot,
  });
  if (error) return { error: `发送失败：${error.message}` };

  revalidatePath("/recommendations");
  return { ok: true, recipient_email: recipient.email };
}

export type AcceptRecResult =
  | { ok: true; place_id: string; list_id: string }
  | { error: string };

export async function acceptRecommendation(args: {
  id: string;
  target_list_id: string;
}): Promise<AcceptRecResult> {
  const user = await requireUser();
  const supabase = await createClient();

  // 1. 读 recommendation 且必须是当前用户接收的
  const { data: rec } = await supabase
    .from("recommendations")
    .select("id, to_user_id, place_data, status")
    .eq("id", args.id)
    .maybeSingle<{
      id: string;
      to_user_id: string;
      place_data: SnapshottedPlace;
      status: string;
    }>();
  if (!rec) return { error: "找不到这条推荐" };
  if (rec.to_user_id !== user.id) return { error: "这不是给你的推荐" };
  if (rec.status !== "pending")
    return { error: "这条推荐已经处理过了" };

  // 2. 目标 list 必须属于当前用户（owner 或 co_owner）
  const { data: targetList } = await supabase
    .from("lists")
    .select("id, owner_id")
    .eq("id", args.target_list_id)
    .maybeSingle<{ id: string; owner_id: string }>();
  if (!targetList) return { error: "目标 list 不存在" };

  // 检查 member 关系
  if (targetList.owner_id !== user.id) {
    const { data: member } = await supabase
      .from("list_members")
      .select("role")
      .eq("list_id", args.target_list_id)
      .eq("user_id", user.id)
      .maybeSingle<{ role: string }>();
    if (!member || member.role !== "co_owner") {
      return { error: "你不能往这个 list 里加东西" };
    }
  }

  // 3. 把 snapshot 插入 places
  const snap = rec.place_data;
  const reasons = snap.message
    ? [{ user_id: snap.from_user_id, text: snap.message }]
    : [];

  const { data: newPlace, error: insErr } = await supabase
    .from("places")
    .insert({
      list_id: args.target_list_id,
      name: snap.name,
      address: snap.address,
      cuisine: snap.cuisine,
      price_range: snap.price_range,
      occasions: snap.occasions,
      tags: snap.tags,
      recommended_by: snap.recommended_by,
      notes: snap.notes,
      source: snap.source,
      source_url: snap.source_url,
      photo_urls: snap.photo_urls,
      lat: snap.lat,
      lng: snap.lng,
      google_place_id: snap.google_place_id,
      reasons,
      status: "want_to_go",
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (insErr) return { error: `加入失败：${insErr.message}` };

  // 4. 标推荐 accepted
  await supabase
    .from("recommendations")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", args.id);

  revalidatePath("/recommendations");
  revalidatePath(`/lists/${args.target_list_id}`);
  return { ok: true, place_id: newPlace.id, list_id: args.target_list_id };
}

export async function declineRecommendation(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  await requireUser();
  if (!id) return { error: "缺少 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("recommendations")
    .update({ status: "declined", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: `失败：${error.message}` };
  revalidatePath("/recommendations");
  return { ok: true };
}

export async function withdrawRecommendation(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  await requireUser();
  if (!id) return { error: "缺少 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("recommendations")
    .delete()
    .eq("id", id);
  if (error) return { error: `撤回失败：${error.message}` };
  revalidatePath("/recommendations");
  return { ok: true };
}
