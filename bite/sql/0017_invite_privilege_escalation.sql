-- ============================================================================
-- Bite · Migration 0017 — 修复邀请链路的越权提权
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件全部内容 → Run
--
-- ⚠️ 部署顺序：**先跑本 SQL，再部署代码**。
--    本迁移新增 accept_list_invite() 函数并收紧策略；旧代码走的自助 insert 路径
--    会被关掉。先跑 SQL 的窗口期内，旧代码的「接受邀请」会失败（报错，不是静默）；
--    反过来先部署代码则会因函数不存在而失败。窗口期几分钟，个人项目可接受。
--
-- ---------------------------------------------------------------------------
-- 背景（三条策略叠加 = 任意登录用户可自封任意清单的 co_owner）
--
-- 1) sql/0008 `invites_select_any_auth ... using (true)`
--    注释假设「没 token 就枚举不到」。但 RLS 不是 API 网关：任何登录 session 都能
--    直接打 PostgREST —— `GET /rest/v1/list_invites?select=*` —— 一次拖走全库邀请，
--    含 token 和 list_id。token 的不可枚举性在这条策略下毫无作用。
--
-- 2) sql/0008 `invites_update_claimer_or_owner`
--    USING 只是 `(used_at is null and used_by is null)`，没有任何归属谓词 →
--    任意用户可 UPDATE **任意**未使用的邀请；WITH CHECK 只约束 used_by，
--    不约束 role / expires_at / list_id → 可把 viewer 邀请自行改写成 co_owner，
--    也可把别人刚发的邀请标成已使用来搞破坏。
--
-- 3) sql/0010 `list_members_insert_invitee`
--    只要求「该 list 存在某个未使用、未过期、role 匹配的邀请」，
--    **从未把插入与被兑换的那个具体 token 绑定** → 知道 list_id 即可自助入伙。
--
-- 叠加后：读全库邀请(1) → 改任一条为 co_owner(2) → 自助插入(3)。
-- CLAUDE.md 的「应用层不再重复鉴权」意味着这里没有第二道防线。
--
-- ---------------------------------------------------------------------------
-- 修法：把「接受邀请」收敛成一个 SECURITY DEFINER 函数，原子完成
-- 校验 token → 插 list_members → 标 used。之后三条宽松策略全部收紧：
-- 受邀者不再需要（也不再能）直接 select / update 邀请或 insert 成员。
-- ============================================================================

-- ---- 1. SELECT：只有 owner / 发起人能看邀请 ---------------------------------
-- 受邀者看邀请详情走 get_invite_preview(token)（sql/0011 已有的 SECURITY DEFINER，
-- 只返回精确 token 对应的一行）——「持有 token = 有权看这一条」，而不是「看全部」。
drop policy if exists "invites_select_any_auth" on public.list_invites;

create policy "invites_select_owner_or_creator"
  on public.list_invites for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.lists
      where id = list_invites.list_id and owner_id = auth.uid()
    )
  );

-- ---- 2. UPDATE：只有 owner（撤销 / 改角色）----------------------------------
-- 「标记已使用」不再由受邀者自己写，改由 accept_list_invite() 内部完成。
drop policy if exists "invites_update_claimer_or_owner" on public.list_invites;

create policy "invites_update_owner_only"
  on public.list_invites for update
  to authenticated
  using (
    exists (
      select 1 from public.lists
      where id = list_invites.list_id and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.lists
      where id = list_invites.list_id and owner_id = auth.uid()
    )
  );

-- ---- 3. 移除未绑定 token 的自助入伙 -----------------------------------------
-- 0001 的 list_members_insert_owner（owner 直接加成员）保留不动。
drop policy if exists "list_members_insert_invitee" on public.list_members;

-- ---- 4. 接受邀请：原子的 SECURITY DEFINER 函数 ------------------------------
-- 返回 (ok, error_code, list_id)。error_code 给应用层映射成中文文案，
-- 不在 DB 里写 UI 文案。
create or replace function public.accept_list_invite(p_token uuid)
returns table (ok boolean, error_code text, list_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_invite     public.list_invites%rowtype;
  v_owner_id   uuid;
  v_updated    int;
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

  select owner_id into v_owner_id from public.lists where id = v_invite.list_id;
  if v_owner_id is null then
    return query select false, 'list_gone', v_invite.list_id;
    return;
  end if;
  if v_owner_id = v_uid then
    return query select false, 'already_owner', v_invite.list_id;
    return;
  end if;

  -- 入伙（已是成员则不动其现有角色——不能靠一条旧链接把自己降级或提级）
  -- list_members.role 是 enum list_member_role，list_invites.role 是 text → 显式转换
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
    -- 上面的 for update 理论上排除了这条路径；留作防御
    return query select false, 'already_used', v_invite.list_id;
    return;
  end if;

  return query select true, null::text, v_invite.list_id;
end;
$$;

revoke all on function public.accept_list_invite(uuid) from public;
grant execute on function public.accept_list_invite(uuid) to authenticated;

-- ---- 5. 自检 ---------------------------------------------------------------
-- 跑完后可以确认策略已替换：
--   select policyname from pg_policies
--   where tablename in ('list_invites','list_members') order by tablename, policyname;
-- 期望 list_invites 有 insert_owner_only / select_owner_or_creator /
--      update_owner_only / delete_owner，且**没有** select_any_auth。
-- 期望 list_members **没有** list_members_insert_invitee。
