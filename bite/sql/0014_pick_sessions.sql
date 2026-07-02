-- ============================================================================
-- Bite · Migration 0014 — 双人决策「一起选」（pick sessions + votes）
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run（幂等，可重复跑）
--
-- 玩法：清单成员各自对「想去」的店左滑/右滑，两个人都右滑同一家 → 匹配「就它了」。
--   - pick_sessions：一次"今晚选哪家"的回合（按 list，active → done）
--   - pick_votes：每人每店一票（同 session 内可改票，upsert）
--   - 匹配判定在应用层（castPickVote 后查 2+ 人同意），命中回写 matched_place_id
-- RLS 复用 0001 的 can_read_list（owner 或任意成员可读写；viewer 也能玩——
-- 一起选本来就是共同决策，只读成员参与投票不修改清单本体）。
-- ============================================================================

create table if not exists public.pick_sessions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'done')),
  matched_place_id uuid references public.places(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pick_votes (
  session_id uuid not null references public.pick_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  vote boolean not null,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id, place_id)
);

create index if not exists pick_sessions_list_active_idx
  on public.pick_sessions (list_id, status, created_at desc);

-- 一个清单同时只允许一个 active session（两人同时进「一起选」时，
-- check-then-insert 竞态会各建一个 session 导致永远匹配不上；
-- 唯一部分索引让后到者 23505，应用层捕获后改用已存在的那个）
create unique index if not exists pick_sessions_one_active_per_list
  on public.pick_sessions (list_id) where status = 'active';
create index if not exists pick_votes_session_place_idx
  on public.pick_votes (session_id, place_id) where vote;

alter table public.pick_sessions enable row level security;
alter table public.pick_votes enable row level security;

drop policy if exists "pick_sessions_select_members" on public.pick_sessions;
create policy "pick_sessions_select_members"
  on public.pick_sessions for select
  to authenticated
  using (public.can_read_list(list_id));

drop policy if exists "pick_sessions_insert_members" on public.pick_sessions;
create policy "pick_sessions_insert_members"
  on public.pick_sessions for insert
  to authenticated
  with check (public.can_read_list(list_id) and created_by = auth.uid());

drop policy if exists "pick_sessions_update_members" on public.pick_sessions;
create policy "pick_sessions_update_members"
  on public.pick_sessions for update
  to authenticated
  using (public.can_read_list(list_id))
  with check (public.can_read_list(list_id));

drop policy if exists "pick_votes_select_members" on public.pick_votes;
create policy "pick_votes_select_members"
  on public.pick_votes for select
  to authenticated
  using (
    exists (
      select 1 from public.pick_sessions s
      where s.id = session_id and public.can_read_list(s.list_id)
    )
  );

drop policy if exists "pick_votes_upsert_own" on public.pick_votes;
create policy "pick_votes_upsert_own"
  on public.pick_votes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.pick_sessions s
      where s.id = session_id
        and s.status = 'active'
        and public.can_read_list(s.list_id)
    )
  );

drop policy if exists "pick_votes_update_own" on public.pick_votes;
create policy "pick_votes_update_own"
  on public.pick_votes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
