"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";

export type ProfileFormState = {
  error: string | null;
  ok?: boolean;
  version?: number;
};

function normalize(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export async function updateProfile(
  prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();

  const name = normalize(formData.get("name"));
  const avatarUrl = normalize(formData.get("avatar_url"));

  if (name && name.length > 60) return { error: "名字不超过 60 字" };
  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
    return { error: "头像 URL 必须以 http(s):// 开头" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      name,
      avatar_url: avatarUrl,
    })
    .eq("id", user.id);

  if (error) return { error: `保存失败：${error.message}` };

  revalidatePath("/profile");
  return { error: null, ok: true, version: (prev.version ?? 0) + 1 };
}
