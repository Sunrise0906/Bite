"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";

export type ListFormState = {
  error: string | null;
};

// ---- 新建 list -----------------------------------------------------------
export async function createList(
  _prev: ListFormState,
  formData: FormData,
): Promise<ListFormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: "请输入 list 名称" };
  if (name.length > 80) return { error: "名称不超过 80 字" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .insert({ name, owner_id: user.id })
    .select("id")
    .single();

  if (error) return { error: `创建失败：${error.message}` };

  revalidatePath("/lists");
  redirect(`/lists/${data.id}?toast=list_created`);
}

// ---- 重命名 list ---------------------------------------------------------
export async function renameList(
  _prev: ListFormState,
  formData: FormData,
): Promise<ListFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!id) return { error: "缺少 list id" };
  if (!name) return { error: "请输入 list 名称" };
  if (name.length > 80) return { error: "名称不超过 80 字" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lists")
    .update({ name })
    .eq("id", id);

  if (error) return { error: `重命名失败：${error.message}` };

  revalidatePath("/lists");
  revalidatePath(`/lists/${id}`);
  return { error: null };
}

// ---- 删除 list -----------------------------------------------------------
export async function deleteList(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/lists?error=missing_id");

  const supabase = await createClient();
  const { error } = await supabase.from("lists").delete().eq("id", id);

  if (error) {
    redirect(`/lists/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/lists");
  redirect("/lists?toast=list_deleted");
}
