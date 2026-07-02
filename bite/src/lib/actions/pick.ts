"use server";

import { createClient, requireUser } from "@/lib/supabase/server";
import { signNestedPhotoUrls } from "@/lib/storage/signed-photos";
import { sendPushToUsers } from "@/lib/push/send";

// 「一起选」：清单成员各自对想去的店滑卡投票，两人都右滑同一家 → 匹配。
// 需要 sql/0014（pick_sessions + pick_votes）。

export type PickCard = {
  place_id: string;
  name: string;
  cuisine: string[];
  price_range: string | null;
  photo: string | null;
  reason: string | null;
  google_rating: number | null;
};

export type PickSessionData = {
  session_id: string;
  list_id: string;
  list_name: string;
  status: "active" | "done";
  matched_place_id: string | null;
  /** 想去的候选（去掉我已投过票的） */
  cards: PickCard[];
  /** 我在本 session 已投票数 / 右滑数 */
  my_votes: number;
  my_likes: string[];
  /** 清单成员总数（含 owner），1 = 单人模式 */
  member_count: number;
};

export type PickResult = PickSessionData | { error: string };

/** 进入一起选：拿当前 active session（没有就建一个）+ 候选卡片 */
export async function getOrCreatePickSession(
  listId: string,
): Promise<PickResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: list, error: listErr } = await supabase
    .from("lists")
    .select("id, name, owner_id")
    .eq("id", listId)
    .maybeSingle<{ id: string; name: string; owner_id: string }>();
  if (listErr || !list) return { error: "找不到这个清单（或没有权限）" };

  // 找 active session（按 created_at asc 两端收敛到同一个）；没有就建。
  // 建的时候可能撞唯一索引（两人同时进）——23505 时改用对方刚建的那个。
  type SessionRow = {
    id: string;
    status: "active" | "done";
    matched_place_id: string | null;
  };
  const findActive = async () => {
    const { data } = await supabase
      .from("pick_sessions")
      .select("id, status, matched_place_id")
      .eq("list_id", listId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<SessionRow>();
    return data;
  };

  let session = await findActive();
  if (!session) {
    const { data: created, error: createErr } = await supabase
      .from("pick_sessions")
      .insert({ list_id: listId, created_by: user.id })
      .select("id, status, matched_place_id")
      .single<SessionRow>();
    if (created) {
      session = created;
    } else if (createErr?.code === "23505") {
      // 对方抢先建好了：用 ta 的
      session = await findActive();
    }
    if (!session) {
      return {
        error:
          "开不了一起选（数据库还没跑 sql/0014？）：" +
          (createErr?.message ?? "未知错误"),
      };
    }
  }

  const [{ data: places }, { data: votes }, { count: memberCount }] =
    await Promise.all([
      supabase
        .from("places")
        .select(
          "id, name, cuisine, price_range, photo_urls, reasons, google_rating",
        )
        .eq("list_id", listId)
        .eq("status", "want_to_go")
        .order("updated_at", { ascending: false })
        .limit(40),
      supabase
        .from("pick_votes")
        .select("place_id, vote")
        .eq("session_id", session.id)
        .eq("user_id", user.id),
      supabase
        .from("list_members")
        .select("user_id", { count: "exact", head: true })
        .eq("list_id", listId),
    ]);

  const votedIds = new Set((votes ?? []).map((v) => v.place_id));
  const myLikes = (votes ?? []).filter((v) => v.vote).map((v) => v.place_id);

  const rows = (places ?? []) as Array<{
    id: string;
    name: string;
    cuisine: string[] | null;
    price_range: string | null;
    photo_urls: string[] | null;
    reasons: Array<{ user_id: string; text: string }> | null;
    google_rating: number | null;
  }>;
  // 封面签名（photos bucket 私有）
  const signed = await signNestedPhotoUrls(
    supabase,
    rows.map((p) => (p.photo_urls ?? []).slice(0, 1)),
  );

  const cards: PickCard[] = rows
    .filter((p) => !votedIds.has(p.id))
    .map((p) => {
      const i = rows.indexOf(p);
      const myReason =
        (p.reasons ?? []).find((r) => r.user_id === user.id)?.text ??
        (p.reasons ?? [])[0]?.text ??
        null;
      return {
        place_id: p.id,
        name: p.name,
        cuisine: p.cuisine ?? [],
        price_range: p.price_range,
        photo: signed[i]?.[0] ?? null,
        reason: myReason,
        google_rating: p.google_rating,
      };
    });

  return {
    session_id: session.id,
    list_id: listId,
    list_name: list.name,
    status: session.status,
    matched_place_id: session.matched_place_id,
    cards,
    my_votes: votedIds.size,
    my_likes: myLikes,
    member_count: (memberCount ?? 0) + 1, // + owner
  };
}

export type VoteResult =
  | { ok: true; matched: null | { place_id: string; name: string } }
  | { error: string };

/** 投一票；两人（不同 user）都右滑同一家 → 回写匹配并结束 session */
export async function castPickVote(
  sessionId: string,
  placeId: string,
  vote: boolean,
): Promise<VoteResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error: upErr } = await supabase.from("pick_votes").upsert(
    {
      session_id: sessionId,
      user_id: user.id,
      place_id: placeId,
      vote,
    },
    { onConflict: "session_id,user_id,place_id" },
  );
  if (upErr) return { error: `投票失败：${upErr.message}` };

  if (!vote) return { ok: true, matched: null };

  // 匹配判定：本 session 内这家店有 ≥2 个不同用户右滑
  const { data: yesVotes } = await supabase
    .from("pick_votes")
    .select("user_id")
    .eq("session_id", sessionId)
    .eq("place_id", placeId)
    .eq("vote", true);
  const distinct = new Set((yesVotes ?? []).map((v) => v.user_id));
  if (distinct.size < 2) return { ok: true, matched: null };

  const { data: place } = await supabase
    .from("places")
    .select("id, name")
    .eq("id", placeId)
    .maybeSingle<{ id: string; name: string }>();

  // 只有真正把 session 从 active 翻成 done 的那次调用"赢"——并发双 match 时
  // 输家沿用已写入的 matched_place_id，避免两端结果不一致 / 推送重复
  const { data: won } = await supabase
    .from("pick_sessions")
    .update({ status: "done", matched_place_id: placeId })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("list_id");

  if (!won || won.length === 0) {
    const { data: s } = await supabase
      .from("pick_sessions")
      .select("matched_place_id")
      .eq("id", sessionId)
      .maybeSingle<{ matched_place_id: string | null }>();
    if (s?.matched_place_id) {
      const { data: p2 } = await supabase
        .from("places")
        .select("id, name")
        .eq("id", s.matched_place_id)
        .maybeSingle<{ id: string; name: string }>();
      return {
        ok: true,
        matched: { place_id: s.matched_place_id, name: p2?.name ?? "这家店" },
      };
    }
    return { ok: true, matched: null };
  }

  // 通知双方：就它了！（未配 push 则静默跳过）
  await sendPushToUsers([...distinct], {
    title: "就它了！🎉",
    body: `你们都想吃「${place?.name ?? "这家店"}」`,
    url: `/lists/${won[0].list_id}/places/${placeId}`,
  });

  return {
    ok: true,
    matched: { place_id: placeId, name: place?.name ?? "这家店" },
  };
}

export type MatchCheck =
  | { status: "active" }
  | { status: "done"; place_id: string | null; name: string | null }
  | { error: string };

/** 轮询：对方滑完了吗 / 匹配了吗 */
export async function checkPickMatch(sessionId: string): Promise<MatchCheck> {
  await requireUser();
  const supabase = await createClient();
  const { data: s, error } = await supabase
    .from("pick_sessions")
    .select("status, matched_place_id")
    .eq("id", sessionId)
    .maybeSingle<{ status: "active" | "done"; matched_place_id: string | null }>();
  if (error || !s) return { error: "会话不存在" };
  if (s.status === "active") return { status: "active" };
  let name: string | null = null;
  if (s.matched_place_id) {
    const { data: p } = await supabase
      .from("places")
      .select("name")
      .eq("id", s.matched_place_id)
      .maybeSingle<{ name: string }>();
    name = p?.name ?? null;
  }
  return { status: "done", place_id: s.matched_place_id, name };
}

/**
 * 再来一轮：只结束「自己刚玩完的那个」session（按 id，幂等）。
 * 不能按 list 全量置 done——两人同时点再来一轮时，后点者会把先点者
 * 刚建好的新 session 干掉，先点者的票会全部被 RLS 拒。
 */
export async function restartPickSession(
  listId: string,
  finishedSessionId: string,
): Promise<PickResult> {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from("pick_sessions")
    .update({ status: "done" })
    .eq("id", finishedSessionId)
    .eq("status", "active");
  return getOrCreatePickSession(listId);
}
