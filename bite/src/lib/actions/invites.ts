"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";

export type CreateInviteResult =
  | { ok: true; token: string; expires_at: string }
  | { error: string };

export async function createListInvite(
  listId: string,
  role: "co_owner" | "viewer" = "co_owner",
): Promise<CreateInviteResult> {
  const user = await requireUser();
  if (!listId) return { error: "缺少 list_id" };
  if (role !== "co_owner" && role !== "viewer") return { error: "未知角色" };

  const supabase = await createClient();

  // 校验 owner
  const { data: list } = await supabase
    .from("lists")
    .select("id, owner_id, name")
    .eq("id", listId)
    .maybeSingle<{ id: string; owner_id: string; name: string }>();
  if (!list) return { error: "找不到这个 list" };
  if (list.owner_id !== user.id) return { error: "只有 owner 能发邀请" };

  const { data, error } = await supabase
    .from("list_invites")
    .insert({
      list_id: listId,
      created_by: user.id,
      role,
    })
    .select("token, expires_at")
    .single<{ token: string; expires_at: string }>();

  if (error) return { error: `创建失败：${error.message}` };

  revalidatePath(`/lists/${listId}`);
  return { ok: true, token: data.token, expires_at: data.expires_at };
}

export type InvitePreview = {
  token: string;
  list_id: string;
  list_name: string;
  role: "co_owner" | "viewer";
  expired: boolean;
  used: boolean;
  is_owner: boolean;
};

/** 给 /invite/[token] 页面用，预览邀请详情 */
export async function loadInvitePreview(
  token: string,
): Promise<InvitePreview | null> {
  if (!token) return null;
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("list_invites")
    .select("token, list_id, role, expires_at, used_at, used_by")
    .eq("token", token)
    .maybeSingle<{
      token: string;
      list_id: string;
      role: "co_owner" | "viewer";
      expires_at: string;
      used_at: string | null;
      used_by: string | null;
    }>();

  if (!data) return null;

  const { data: list } = await supabase
    .from("lists")
    .select("name, owner_id")
    .eq("id", data.list_id)
    .maybeSingle<{ name: string; owner_id: string }>();
  if (!list) return null;

  const expired = new Date(data.expires_at) < new Date();
  const used = data.used_at !== null;
  const is_owner = list.owner_id === user.id;

  return {
    token: data.token,
    list_id: data.list_id,
    list_name: list.name,
    role: data.role,
    expired,
    used,
    is_owner,
  };
}

export type AcceptResult =
  | { ok: true; list_id: string }
  | { error: string };

export async function acceptListInvite(token: string): Promise<AcceptResult> {
  const user = await requireUser();
  if (!token) return { error: "缺少 token" };
  const supabase = await createClient();

  const { data: invite } = await supabase
    .from("list_invites")
    .select("token, list_id, role, expires_at, used_at, created_by")
    .eq("token", token)
    .maybeSingle<{
      token: string;
      list_id: string;
      role: "co_owner" | "viewer";
      expires_at: string;
      used_at: string | null;
      created_by: string;
    }>();
  if (!invite) return { error: "邀请不存在或已被撤销" };
  if (invite.used_at) return { error: "这个邀请已经被使用过了" };
  if (new Date(invite.expires_at) < new Date())
    return { error: "邀请已过期" };
  if (invite.created_by === user.id)
    return { error: "你不能加入自己创建的邀请" };

  // 防重复：先看是否已经是 member
  const { data: existing } = await supabase
    .from("list_members")
    .select("list_id")
    .eq("list_id", invite.list_id)
    .eq("user_id", user.id)
    .maybeSingle<{ list_id: string }>();

  if (!existing) {
    const { error: insErr } = await supabase.from("list_members").insert({
      list_id: invite.list_id,
      user_id: user.id,
      role: invite.role,
      invited_by: invite.created_by,
    });
    if (insErr) return { error: `加入失败：${insErr.message}` };
  }

  // 标 used。失败不阻断用户（成员已加入），但要留痕：token 没标掉意味着
  // 链接还能被再次使用，owner 可在 ActiveInvitesPanel 手动撤销
  const { error: usedErr } = await supabase
    .from("list_invites")
    .update({
      used_at: new Date().toISOString(),
      used_by: user.id,
    })
    .eq("token", token);
  if (usedErr) {
    console.error(`acceptListInvite: 加入成功但标记 used 失败（token=${token}）：${usedErr.message}`);
  }

  revalidatePath("/lists");
  revalidatePath(`/lists/${invite.list_id}`);

  return { ok: true, list_id: invite.list_id };
}

export async function revokeListInvite(token: string): Promise<{
  ok: true;
} | { error: string }> {
  await requireUser();
  if (!token) return { error: "缺少 token" };
  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("list_invites")
    .select("list_id")
    .eq("token", token)
    .maybeSingle<{ list_id: string }>();
  const { error } = await supabase.from("list_invites").delete().eq("token", token);
  if (error) return { error: `撤销失败：${error.message}` };
  if (invite?.list_id) revalidatePath(`/lists/${invite.list_id}`);
  return { ok: true };
}
