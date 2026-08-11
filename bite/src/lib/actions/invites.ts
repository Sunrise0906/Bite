"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push/send";

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

  // owner 或 co_owner 都能发邀请（sql/0024 把 RLS 也放宽到 can_write_list）。
  // 清单一旦超过两个人，「只有 owner 能拉人」就是硬瓶颈。
  const { data: list } = await supabase
    .from("lists")
    .select("id, owner_id, name")
    .eq("id", listId)
    .maybeSingle<{ id: string; owner_id: string; name: string }>();
  if (!list) return { error: "找不到这个 list" };
  if (list.owner_id !== user.id) {
    const { data: me } = await supabase
      .from("list_members")
      .select("role")
      .eq("list_id", listId)
      .eq("user_id", user.id)
      .maybeSingle<{ role: string }>();
    if (me?.role !== "co_owner") {
      return { error: "只有所有者和共同所有者能发邀请" };
    }
  }

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
  /** 清单 owner = 邀请发起人（invites_insert_owner_only 保证两者一致） */
  owner_id: string;
};

/** 给 /invite/[token] 页面用，预览邀请详情 */
export async function loadInvitePreview(
  token: string,
): Promise<InvitePreview | null> {
  if (!token) return null;
  const user = await requireUser();
  const supabase = await createClient();

  // 受邀者还不是成员，无法直接读 lists（RLS）。走 security-definer 函数
  // get_invite_preview（见 sql/0011），凭 token 拿 list 名 + owner，绕过成员校验。
  const { data, error } = await supabase
    .rpc("get_invite_preview", { p_token: token })
    .maybeSingle<{
      token: string;
      list_id: string;
      list_name: string;
      role: "co_owner" | "viewer";
      expires_at: string;
      used_at: string | null;
      owner_id: string;
    }>();

  if (error || !data) return null;

  const expired = new Date(data.expires_at) < new Date();
  const used = data.used_at !== null;
  const is_owner = data.owner_id === user.id;

  return {
    token: data.token,
    list_id: data.list_id,
    list_name: data.list_name,
    role: data.role,
    expired,
    used,
    is_owner,
    owner_id: data.owner_id,
  };
}

export type AcceptResult =
  | { ok: true; list_id: string }
  | { error: string };

/** accept_list_invite() 的 error_code → 中文文案（DB 只回码，不写 UI 文案） */
const ACCEPT_ERROR_TEXT: Record<string, string> = {
  not_authenticated: "请先登录",
  not_found: "邀请不存在或已被撤销",
  already_used: "这个邀请已经被使用过了",
  expired: "邀请已过期",
  self_invite: "你不能加入自己创建的邀请",
  list_gone: "这个清单已经被删除了",
  already_owner: "你就是这个清单的所有者",
};

export async function acceptListInvite(token: string): Promise<AcceptResult> {
  const user = await requireUser();
  if (!token) return { error: "缺少 token" };
  const supabase = await createClient();

  // 整个「校验 token → 插 list_members → 标 used」收敛进一个 SECURITY DEFINER
  // 函数（sql/0017），原子完成。此前是应用层分三步做，而 DB 侧为了让它能跑通
  // 开了三条过宽的策略，叠加起来任何登录用户都能自封任意清单的 co_owner。
  // OUT 参数叫 out_list_id 而不是 list_id：后者会和 list_members/list_invites 的
  // 同名列在 PL/pgSQL 里撞车（42702 ambiguous），见 sql/0018 的文件头。
  const { data, error } = await supabase
    .rpc("accept_list_invite", { p_token: token })
    .maybeSingle<{
      ok: boolean;
      error_code: string | null;
      out_list_id: string | null;
    }>();

  if (error) return { error: `加入失败：${error.message}` };
  if (!data) return { error: "邀请不存在或已被撤销" };
  if (!data.ok) {
    return {
      error: ACCEPT_ERROR_TEXT[data.error_code ?? ""] ?? "加入失败，请重试",
    };
  }

  const listId = data.out_list_id!;

  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);

  // 通知邀请发起人：有人加入了（best-effort，未配 push 静默跳过）。
  // 收紧策略后受邀者读不到 list_invites，改从 preview 函数拿发起人。
  const preview = await loadInvitePreview(token);
  const { data: joiner } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle<{ name: string | null; email: string }>();
  const joinerLabel = joiner?.name ?? joiner?.email?.split("@")[0] ?? "有人";
  if (preview) {
    await sendPushToUsers([preview.owner_id], {
      title: "清单来了新成员",
      body: `${joinerLabel} 通过邀请链接加入了你的清单`,
      url: `/lists/${listId}`,
    });
  }

  return { ok: true, list_id: listId };
}

export async function revokeListInvite(token: string): Promise<{
  ok: true;
} | { error: string }> {
  await requireUser();
  if (!token) return { error: "缺少 token" };
  const supabase = await createClient();
  // ⚠️ RLS 挡掉时 Postgres 不报错、只是影响 0 行。必须 .select() 回读行数，
  // 否则非 owner 点撤销会看到「撤销成功」而邀请仍然有效。
  const { data: deleted, error } = await supabase
    .from("list_invites")
    .delete()
    .eq("token", token)
    .select("token, list_id");
  if (error) return { error: `撤销失败：${error.message}` };
  if (!deleted || deleted.length === 0) {
    return { error: "撤销失败：邀请不存在，或你不是这个清单的所有者" };
  }
  const listId = (deleted[0] as { list_id: string }).list_id;
  if (listId) revalidatePath(`/lists/${listId}`);
  return { ok: true };
}
