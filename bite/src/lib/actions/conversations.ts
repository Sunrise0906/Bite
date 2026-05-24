"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import {
  deleteConversation as dbDelete,
  getConversation,
} from "@/lib/db/chat";

// ---- 删除会话 -------------------------------------------------------------
export async function deleteConversationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/chat?error=missing_id");

  const supabase = await createClient();
  const result = await dbDelete(supabase, id, user.id);
  if ("error" in result) {
    redirect(`/chat?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/chat");
  redirect("/chat");
}

// ---- 重命名会话 ----------------------------------------------------------
export type RenameConvoState = { error: string | null };

export async function renameConversationAction(
  _prev: RenameConvoState,
  formData: FormData,
): Promise<RenameConvoState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!id) return { error: "缺少会话 id" };
  if (!title) return { error: "标题不能为空" };
  if (title.length > 80) return { error: "标题不超过 80 字" };

  const supabase = await createClient();
  // 校验归属
  const convo = await getConversation(supabase, id, user.id);
  if (!convo) return { error: "找不到这个会话" };

  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `重命名失败：${error.message}` };

  revalidatePath("/chat");
  return { error: null };
}
