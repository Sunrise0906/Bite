"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { fetchDisplayNames, displayNameOf } from "@/lib/db/display-names";
import { notifyListMembersNewComment } from "@/lib/push/notify-list";

// 店铺评论：清单成员之间真正的「对话」。需要 sql/0025。
//
// 和 reasons 的分工：reasons 是「我为什么想去」——每人一条、要改就是覆盖，
// 是对店的**表态**；评论是对彼此说话，可以你一句我一句。

export type CommentView = {
  id: string;
  user_id: string;
  author: string;
  body: string;
  created_at: string;
  editable: boolean;
};

const MAX_LEN = 1000;

export async function listComments(placeId: string): Promise<CommentView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("place_comments")
    .select("id, user_id, body, created_at")
    .eq("place_id", placeId)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    body: string;
    created_at: string;
  }>;
  const names = await fetchDisplayNames(
    supabase,
    rows.map((r) => r.user_id),
  );
  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    author: displayNameOf(names, r.user_id),
    body: r.body,
    created_at: r.created_at,
    editable: r.user_id === user.id,
  }));
}

export type AddCommentResult =
  | { ok: true; comment: CommentView }
  | { error: string };

export async function addComment(
  placeId: string,
  body: string,
): Promise<AddCommentResult> {
  const user = await requireUser();
  const text = body.trim();
  if (!text) return { error: "说点什么再发" };
  if (text.length > MAX_LEN) return { error: `太长了，${MAX_LEN} 字以内` };

  const supabase = await createClient();

  // list_id 从 place 反查，不信任客户端传进来的 —— 否则可以往任意清单塞评论
  const { data: place } = await supabase
    .from("places")
    .select("id, list_id, name")
    .eq("id", placeId)
    .maybeSingle<{ id: string; list_id: string; name: string }>();
  if (!place) return { error: "找不到这家店（或没有权限）" };

  const { data, error } = await supabase
    .from("place_comments")
    .insert({
      place_id: placeId,
      list_id: place.list_id,
      user_id: user.id,
      body: text,
    })
    .select("id, user_id, body, created_at")
    // RLS 挡掉时只影响 0 行、不报错（见 CLAUDE.md）
    .maybeSingle<{
      id: string;
      user_id: string;
      body: string;
      created_at: string;
    }>();

  if (error) {
    // 表还没建时给能照做的提示，而不是甩一个 Postgres 错误码
    if (error.code === "42P01") {
      return { error: "评论功能还没启用（数据库还没跑 sql/0025）" };
    }
    return { error: `发送失败：${error.message}` };
  }
  if (!data) return { error: "你没有这个清单的访问权限" };

  await notifyListMembersNewComment(
    supabase,
    user.id,
    place.list_id,
    placeId,
    place.name,
    text,
  );

  const names = await fetchDisplayNames(supabase, [user.id]);
  revalidatePath(`/lists/${place.list_id}/places/${placeId}`);
  return {
    ok: true,
    comment: {
      id: data.id,
      user_id: data.user_id,
      author: displayNameOf(names, data.user_id),
      body: data.body,
      created_at: data.created_at,
      editable: true,
    },
  };
}

export async function deleteComment(
  commentId: string,
): Promise<{ ok: true } | { error: string }> {
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("place_comments")
    .delete()
    .eq("id", commentId)
    .select("id, list_id, place_id");

  if (error) return { error: `删除失败：${error.message}` };
  // RLS 只允许删自己的：别人的评论会静默影响 0 行
  if (!data || data.length === 0) return { error: "只能删自己的留言" };

  const row = data[0] as { list_id: string; place_id: string };
  revalidatePath(`/lists/${row.list_id}/places/${row.place_id}`);
  return { ok: true };
}
