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

  const { error } = await supabase
    .from("list_members")
    .update({ role: newRole })
    .eq("list_id", listId)
    .eq("user_id", memberUserId);
  if (error) return { error: `失败：${error.message}` };

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

  const { error } = await supabase
    .from("list_members")
    .delete()
    .eq("list_id", listId)
    .eq("user_id", memberUserId);
  if (error) return { error: `失败：${error.message}` };

  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

/** co_owner / viewer 自己主动离开 */
export async function leaveList(
  listId: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("list_members")
    .delete()
    .eq("list_id", listId)
    .eq("user_id", user.id);
  if (error) return { error: `失败：${error.message}` };

  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}
