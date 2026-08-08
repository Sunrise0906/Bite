"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";

/** owner 改成员角色 */
export async function changeMemberRole(
  listId: string,
  memberUserId: string,
  newRole: "co_owner" | "viewer",
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("lists")
    .select("owner_id")
    .eq("id", listId)
    .maybeSingle<{ owner_id: string }>();
  if (!list || list.owner_id !== user.id) return { error: "无权限" };

  // .select() 验证真的改到了行：无 UPDATE policy / 成员不存在时 update 匹配
  // 0 行且不报错，不能让 UI 假装成功
  const { data: updated, error } = await supabase
    .from("list_members")
    .update({ role: newRole })
    .eq("list_id", listId)
    .eq("user_id", memberUserId)
    .select("user_id");
  if (error) return { error: `失败：${error.message}` };
  if (!updated || updated.length === 0) {
    return { error: "修改没有生效：找不到该成员，或数据库缺少权限（检查 sql/0010 是否已执行）" };
  }

  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

/** owner 移除成员 */
export async function removeMember(
  listId: string,
  memberUserId: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("lists")
    .select("owner_id")
    .eq("id", listId)
    .maybeSingle<{ owner_id: string }>();
  if (!list || list.owner_id !== user.id) return { error: "无权限" };

  const { data: removed, error } = await supabase
    .from("list_members")
    .delete()
    .eq("list_id", listId)
    .eq("user_id", memberUserId)
    .select("user_id"); // RLS 静默 0 行的兜底，同 changeMemberRole
  if (error) return { error: `失败：${error.message}` };
  if (!removed || removed.length === 0) return { error: "失败：这个人不在成员列表里" };

  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

/** co_owner / viewer 自己主动离开 */
export async function leaveList(
  listId: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: left, error } = await supabase
    .from("list_members")
    .delete()
    .eq("list_id", listId)
    .eq("user_id", user.id)
    .select("user_id"); // RLS 静默 0 行的兜底，同 changeMemberRole
  if (error) return { error: `失败：${error.message}` };
  if (!left || left.length === 0) {
    // owner 没有 list_members 行，所以 owner 点「离开」会走到这里
    return { error: "失败：你不是这个清单的成员（清单所有者不能离开自己的清单）" };
  }

  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}
