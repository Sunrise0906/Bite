-- ============================================================================
-- Bite · Migration 0008 — list 邀请链接表
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
--
-- 表：
--   list_invites — 单次使用的 list 邀请链接
--
-- 流程：
--   1. owner 在 /lists/[id] 点"邀请" → 调 createListInvite → 插一行得到 token
--   2. 拷链接 /invite/<token> 给朋友
--   3. 朋友点链接 → /invite/[token] 页面 → "加入" → acceptListInvite 把 token 标 used + 写 list_members
-- ============================================================================

create table public.list_invites (
  token uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  -- 接收方加入后的角色
  role text not null default 'co_owner'
    check (role in ('co_owner', 'viewer')),
  -- 默认 7 天有效
  expires_at timestamptz not null default (now() + interval '7 days'),
  -- 被使用后填上
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index list_invites_list_id_idx on public.list_invites(list_id);
create index list_invites_created_by_idx on public.list_invites(created_by);

alter table public.list_invites enable row level security;

-- 仅 list owner 可以创建邀请
create policy "invites_insert_owner_only"
  on public.list_invites for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  );

-- 任何登录用户都能 select：token 在 URL 里就是访问凭据，
-- 没 token 就枚举不到。可接受（token 是 uuid v4，2^122 空间）。
create policy "invites_select_any_auth"
  on public.list_invites for select
  to authenticated
  using (true);

-- update：
--   1) 被邀请方（still unused）把自己标 used_by/used_at
--   2) owner 撤销 / 改 role
create policy "invites_update_claimer_or_owner"
  on public.list_invites for update
  to authenticated
  using (
    (used_at is null and used_by is null)
    or exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  )
  with check (
    -- 防止 used_by 被改成别人；只能写当前用户自己
    (used_by is null or used_by = auth.uid())
    or exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  );

-- 删除仅 owner
create policy "invites_delete_owner"
  on public.list_invites for delete
  to authenticated
  using (
    exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  );
