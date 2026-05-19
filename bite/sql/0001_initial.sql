-- ============================================================================
-- Bite · Initial schema (Phase 1)
--
-- 用法：在 Supabase Dashboard → SQL Editor → 粘贴本文件全部内容 → Run
-- 后续 schema 变更请在 sql/ 目录新建 0002_*.sql，逐个执行。
-- ============================================================================

-- ---- 0. Extensions ---------------------------------------------------------
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---- 1. Enums --------------------------------------------------------------
create type list_member_role as enum ('co_owner', 'viewer');

create type place_status as enum ('want_to_go', 'visited', 'archived');
create type place_price as enum ('$', '$$', '$$$', '$$$$');
create type place_source as enum ('manual', 'xhs', 'ai_extract', 'google_places', 'yelp');

create type visit_sentiment as enum ('will_return', 'okay', 'wont_return');

create type recommendation_status as enum ('pending', 'accepted', 'declined');

-- ---- 2. Tables -------------------------------------------------------------

-- 2.1 profiles：扩展 auth.users 的公开字段
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.2 lists
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.3 list_members（不含 owner，owner 通过 lists.owner_id 表达）
create table public.list_members (
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role list_member_role not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

-- 2.4 places
create table public.places (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  name text not null,
  address text not null,
  cuisine text[] not null default '{}',
  price_range place_price,
  status place_status not null default 'want_to_go',
  -- 共享 list 内多人各写一条 reason：[{user_id: "...", text: "..."}]
  reasons jsonb not null default '[]'::jsonb,
  occasions text[] not null default '{}',
  recommended_by text,
  tags text[] not null default '{}',
  source place_source not null default 'manual',
  source_url text,
  google_place_id text,
  lat numeric(10, 6),
  lng numeric(10, 6),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.5 visit_logs
create table public.visit_logs (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  visited_at timestamptz not null default now(),
  sentiment visit_sentiment not null,
  star_rating int check (star_rating between 1 and 5),
  note text,
  photos text[] not null default '{}',
  companions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.6 recommendations（跨 list 推荐，pending → accepted/declined）
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  -- place 的完整快照，accept 时 to_user 选择目标 list 并复制成新 place
  place_data jsonb not null,
  status recommendation_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_user_id <> to_user_id)
);

-- ---- 3. Indexes ------------------------------------------------------------
create index lists_owner_id_idx on public.lists(owner_id);
create index list_members_user_id_idx on public.list_members(user_id);
create index places_list_id_idx on public.places(list_id);
create index places_created_by_idx on public.places(created_by);
create index places_status_idx on public.places(list_id, status);
create index visit_logs_place_id_idx on public.visit_logs(place_id);
create index visit_logs_user_id_idx on public.visit_logs(user_id);
create index visit_logs_visited_at_idx on public.visit_logs(place_id, visited_at desc);
create index recommendations_to_user_idx on public.recommendations(to_user_id) where status = 'pending';

-- ---- 4. updated_at 自动维护 -----------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger lists_set_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();
create trigger places_set_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();
create trigger visit_logs_set_updated_at
  before update on public.visit_logs
  for each row execute function public.set_updated_at();

-- ---- 5. 注册时自动创建 profile + 默认 list ------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 5.1 创建 profile（auth.users 的公开字段镜像）
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );

  -- 5.2 创建默认 list，避免新用户首次进入空白态
  insert into public.lists (name, owner_id)
  values ('我的想去', new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- 6. RLS helper functions（security definer 绕过 RLS 避免递归）---------

create or replace function public.can_read_list(p_list_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.lists
    where id = p_list_id and owner_id = auth.uid()
  ) or exists (
    select 1 from public.list_members
    where list_id = p_list_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_write_list(p_list_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.lists
    where id = p_list_id and owner_id = auth.uid()
  ) or exists (
    select 1 from public.list_members
    where list_id = p_list_id
      and user_id = auth.uid()
      and role = 'co_owner'
  );
$$;

-- ---- 7. RLS：先开启 -------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.lists           enable row level security;
alter table public.list_members    enable row level security;
alter table public.places          enable row level security;
alter table public.visit_logs      enable row level security;
alter table public.recommendations enable row level security;

-- ---- 8. RLS：profiles -----------------------------------------------------
-- 所有登录用户可读（用于显示 reasons 中的 @user 名字）
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- 9. RLS：lists --------------------------------------------------------
create policy "lists_select_member"
  on public.lists for select
  to authenticated
  using (owner_id = auth.uid() or public.can_read_list(id));

create policy "lists_insert_self"
  on public.lists for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "lists_update_owner"
  on public.lists for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "lists_delete_owner"
  on public.lists for delete
  to authenticated
  using (owner_id = auth.uid());

-- ---- 10. RLS：list_members ------------------------------------------------
create policy "list_members_select"
  on public.list_members for select
  to authenticated
  using (user_id = auth.uid() or public.can_read_list(list_id));

create policy "list_members_insert_owner"
  on public.list_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  );

-- 成员可自行退出；owner 可移除任意成员
create policy "list_members_delete_self_or_owner"
  on public.list_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  );

-- ---- 11. RLS：places ------------------------------------------------------
create policy "places_select"
  on public.places for select
  to authenticated
  using (public.can_read_list(list_id));

create policy "places_insert"
  on public.places for insert
  to authenticated
  with check (public.can_write_list(list_id) and created_by = auth.uid());

create policy "places_update"
  on public.places for update
  to authenticated
  using (public.can_write_list(list_id))
  with check (public.can_write_list(list_id));

create policy "places_delete"
  on public.places for delete
  to authenticated
  using (public.can_write_list(list_id));

-- ---- 12. RLS：visit_logs --------------------------------------------------
create policy "visit_logs_select"
  on public.visit_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.places
      where places.id = place_id
        and public.can_read_list(places.list_id)
    )
  );

create policy "visit_logs_insert_self"
  on public.visit_logs for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "visit_logs_update_self"
  on public.visit_logs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "visit_logs_delete_self"
  on public.visit_logs for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- 13. RLS：recommendations --------------------------------------------
create policy "recommendations_select"
  on public.recommendations for select
  to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

create policy "recommendations_insert_self"
  on public.recommendations for insert
  to authenticated
  with check (from_user_id = auth.uid());

-- 收件人可接受/拒绝（更新 status）；发件人可撤回（delete）
create policy "recommendations_update_recipient"
  on public.recommendations for update
  to authenticated
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid());

create policy "recommendations_delete_sender"
  on public.recommendations for delete
  to authenticated
  using (from_user_id = auth.uid());
