"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { isListCategory } from "@/lib/categories";

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
  const catRaw = String(formData.get("category") ?? "food");
  const category = isListCategory(catRaw) ? catRaw : "food";

  if (!name) return { error: "请输入 list 名称" };
  if (name.length > 80) return { error: "名称不超过 80 字" };

  const supabase = await createClient();
  let { data, error } = await supabase
    .from("lists")
    .insert({ name, owner_id: user.id, category })
    .select("id")
    .single();

  // 兼容 sql/0016 未跑：category 列不存在时退回旧 insert
  if (error && /category/i.test(error.message)) {
    ({ data, error } = await supabase
      .from("lists")
      .insert({ name, owner_id: user.id })
      .select("id")
      .single());
  }

  if (error || !data) {
    return { error: `创建失败：${error?.message ?? "未知错误"}` };
  }

  revalidatePath("/lists");
  redirect(`/lists/${data.id}?toast=list_created`);
}

// ---- 新建 list 但留在原地（quick-add 等流程用）---------------------------
// 不 redirect，返回 id 让调用方 revalidate / refresh。
export type CreateListInPlaceResult =
  | { ok: true; id: string }
  | { error: string };

export async function createListInPlace(
  name: string,
): Promise<CreateListInPlaceResult> {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { error: "请输入 list 名称" };
  if (trimmed.length > 80) return { error: "名称不超过 80 字" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .insert({ name: trimmed, owner_id: user.id })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: `创建失败：${error.message}` };

  revalidatePath("/lists");
  revalidatePath("/quick-add");
  revalidatePath("/quick-add/multi");
  return { ok: true, id: data.id };
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
