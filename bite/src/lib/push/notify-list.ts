import type { createClient } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push/send";
import { fetchDisplayNames, displayNameOf } from "@/lib/db/display-names";

// 共享清单里的动静 → 推送给其他成员。
//
// 这两个函数原来是 quick-add.ts 里的私有函数，于是四条「往清单加店」的路径里
// 只有智能添加那两条会响，手写表单和 AI 聊天加店静悄悄 —— 同一个用户行为，
// 两条代码路径行为不一致，比完全没有通知更让人不信任。抽出来给所有路径共用。
//
// 一律 best-effort：未配 VAPID / service role key 时 sendPushToUsers 内部静默跳过，
// 绝不阻断真正的写入。

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** 清单的其他成员（owner + list_members，排除操作者自己） */
async function otherMembers(
  supabase: SupabaseClient,
  actorId: string,
  listId: string,
): Promise<{ listName: string; targets: string[] } | null> {
  const [{ data: list }, { data: members }] = await Promise.all([
    supabase
      .from("lists")
      .select("name, owner_id")
      .eq("id", listId)
      .maybeSingle<{ name: string; owner_id: string }>(),
    supabase.from("list_members").select("user_id").eq("list_id", listId),
  ]);
  if (!list) return null;
  const targets = [
    list.owner_id,
    ...((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id),
  ].filter((id) => id && id !== actorId);
  return { listName: list.name, targets: [...new Set(targets)] };
}

/** 共享清单加了新店 */
export async function notifyListMembersNewPlace(
  supabase: SupabaseClient,
  actorId: string,
  listId: string,
  what: string,
): Promise<void> {
  const ctx = await otherMembers(supabase, actorId, listId);
  if (!ctx || ctx.targets.length === 0) return;
  const names = await fetchDisplayNames(supabase, [actorId]);
  await sendPushToUsers(ctx.targets, {
    title: `「${ctx.listName}」有新店`,
    body: `${displayNameOf(names, actorId)} 加了 ${what}`,
    url: `/lists/${listId}`,
  });
}

/** 有人在某家店下留言 */
export async function notifyListMembersNewComment(
  supabase: SupabaseClient,
  actorId: string,
  listId: string,
  placeId: string,
  placeName: string,
  body: string,
): Promise<void> {
  const ctx = await otherMembers(supabase, actorId, listId);
  if (!ctx || ctx.targets.length === 0) return;
  const names = await fetchDisplayNames(supabase, [actorId]);
  const preview = body.length > 60 ? `${body.slice(0, 60)}…` : body;
  await sendPushToUsers(ctx.targets, {
    title: `${displayNameOf(names, actorId)} 说了「${placeName}」`,
    body: preview,
    url: `/lists/${listId}/places/${placeId}`,
  });
}
