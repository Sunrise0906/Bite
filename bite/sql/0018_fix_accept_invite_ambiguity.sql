-- ============================================================================
-- Bite · Migration 0018 — 修 0017 的 accept_list_invite() PL/pgSQL 命名冲突
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
-- ⚠️ 跑完这个之前，「接受邀请」是坏的（报 42702），必须跑。
--
-- ---------------------------------------------------------------------------
-- Bug：0017 的函数签名是
--     returns table (ok boolean, error_code text, list_id uuid)
-- 这个 `list_id` OUT 参数在函数体内是一个 PL/pgSQL 变量，而函数体里又有
--     insert into public.list_members (...) ... on conflict (list_id, user_id)
-- ON CONFLICT 的索引推断表达式能看见 PL/pgSQL 变量，于是 `list_id` 既可能指
-- 变量也可能指列 → Postgres 直接拒绝：
--     42702: column reference "list_id" is ambiguous
--     It could refer to either a PL/pgSQL variable or a table column.
--
-- 实测发现（两账号真实走了一遍邀请流程）：邀请能发出、受邀者能看到预览，
-- 但一点「加入」就 42702，成员永远加不进去。
--
-- 修法：OUT 参数改名 out_list_id —— 从根上消除与任何表列同名的可能。
-- （不用「on conflict on constraint <名字>」那种写法，那会依赖一个约束名；
--   改完名之后 on conflict (list_id, user_id) 的索引推断本身就不再有歧义了。）
--
-- 调用方 src/lib/actions/invites.ts 已同步改读 out_list_id。
-- ============================================================================

-- OUT 参数改名 → 必须先 drop（create or replace 不能改签名）
drop function if exists public.accept_list_invite(uuid);

create function public.accept_list_invite(p_token uuid)
returns table (ok boolean, error_code text, out_list_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_invite   public.list_invites%rowtype;
  v_owner_id uuid;
  v_updated  int;
begin
  if v_uid is null then
    return query select false, 'not_authenticated', null::uuid;
    return;
  end if;

  -- 行锁：两人同时点同一条链接时，只有一个能把 used_at 从 null 翻过去
  select * into v_invite
  from public.list_invites
  where token = p_token
  for update;

  if not found then
    return query select false, 'not_found', null::uuid;
    return;
  end if;

  if v_invite.used_at is not null then
    return query select false, 'already_used', v_invite.list_id;
    return;
  end if;

  if v_invite.expires_at <= now() then
    return query select false, 'expired', v_invite.list_id;
    return;
  end if;

  if v_invite.created_by = v_uid then
    return query select false, 'self_invite', v_invite.list_id;
    return;
  end if;

  select l.owner_id into v_owner_id from public.lists l where l.id = v_invite.list_id;
  if v_owner_id is null then
    return query select false, 'list_gone', v_invite.list_id;
    return;
  end if;
  if v_owner_id = v_uid then
    return query select false, 'already_owner', v_invite.list_id;
    return;
  end if;

  -- 入伙（已是成员则不动其现有角色——不能靠一条旧链接把自己降级或提级）。
  -- list_members.role 是 enum list_member_role，list_invites.role 是 text → 显式转换。
  insert into public.list_members (list_id, user_id, role, invited_by)
  values (
    v_invite.list_id,
    v_uid,
    v_invite.role::public.list_member_role,
    v_invite.created_by
  )
  on conflict (list_id, user_id) do nothing;

  -- 标 used，且只在仍未被使用时才算这次兑换成功（并发下的 CAS）
  update public.list_invites
  set used_at = now(), used_by = v_uid
  where token = p_token and used_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return query select false, 'already_used', v_invite.list_id;
    return;
  end if;

  return query select true, null::text, v_invite.list_id;
end;
$$;

revoke all on function public.accept_list_invite(uuid) from public;
grant execute on function public.accept_list_invite(uuid) to authenticated;
