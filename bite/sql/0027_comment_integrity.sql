-- 0027：补上 0025 的两个洞 + 收窄 last_seen_at 的可见范围
--
-- 自查（对抗式复审）查出来的：
--
-- 【洞 1】place_comments 的 update 策略只有 user_id = auth.uid()，
-- list_id / place_id 完全不受约束。也就是说任何人可以先在自己有权限的清单里发一条，
-- 再把它 UPDATE 到**别人清单的某家店**上 —— 一条绕过 can_read_list 的跨清单注入。
-- insert 校验了 can_read_list 而 update 没有，两边口径不一致本身就是信号。
--
-- 【洞 2】insert 只校验 list_id，没人校验 place_id 真的属于那个 list。
-- 而 listComments 是按 place_id 查、授权靠 list_id 上的 select 策略 ——
-- 于是「拿一个自己有权限的 list_id + 别人清单里的 place_id」就能把评论挂过去。
-- CLAUDE.md 写着「DB 权限走 RLS，应用层不再重复鉴权」，所以不能只靠 action 里
-- 那句「从 place 反查 list_id」——那只保证了 UI 这条路干净。
--
-- 修法：用**复合外键**一次性锁死两者的一致性（insert 和 update 都覆盖，
-- 且不依赖任何策略写得对不对），再给 update 补上 can_read_list。
--
-- 【洞 3】last_seen_at 加在 profiles 上，而 profiles 的 select 策略是 using(true)，
-- 于是任何注册用户都能拉到全站所有人的在线时间线。收成列级权限 + 一个只回
-- 「同清单成员」的函数。
--
-- ⚠️ 需要在 Supabase SQL Editor 里手工执行。

-- ---- 洞 1 + 洞 2：复合外键 ----
alter table public.places
  drop constraint if exists places_id_list_id_key;
alter table public.places
  add constraint places_id_list_id_key unique (id, list_id);

alter table public.place_comments
  drop constraint if exists place_comments_place_id_fkey;
alter table public.place_comments
  drop constraint if exists place_comments_place_list_fkey;
alter table public.place_comments
  add constraint place_comments_place_list_fkey
  foreign key (place_id, list_id)
  references public.places(id, list_id)
  on delete cascade;

-- update 也要求「你现在仍然读得到这个清单」，与 insert 口径一致
drop policy if exists "place_comments_update_own" on public.place_comments;
create policy "place_comments_update_own"
  on public.place_comments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_read_list(list_id));

-- ---- 洞 3：last_seen_at 不再全站可读 ----
-- ⚠️ 只写 `revoke select (last_seen_at)` **没有用**：authenticated 上有一条
-- 表级 SELECT 授权，它覆盖所有列，列级 revoke 不会削减它（Postgres 把表级和
-- 列级授权分开记）。必须先撤表级，再逐列授回来。
revoke select on public.profiles from authenticated, anon;

grant select (id, name, email, avatar_url, created_at, updated_at)
  on public.profiles to authenticated;
grant select (id, name, avatar_url) on public.profiles to anon;

-- 只回「和你同在某个清单里」的人的活跃时间
create or replace function public.list_member_activity(p_list_id uuid)
returns table (user_id uuid, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.last_seen_at
  from public.profiles p
  where public.can_read_list(p_list_id)
    and (
      p.id = (select l.owner_id from public.lists l where l.id = p_list_id)
      or p.id in (
        select m.user_id from public.list_members m where m.list_id = p_list_id
      )
    );
$$;

revoke all on function public.list_member_activity(uuid) from public, anon;
grant execute on function public.list_member_activity(uuid) to authenticated;

comment on function public.list_member_activity(uuid) is
  '同清单成员的活跃时间。last_seen_at 已从 profiles 的列级读权限里撤掉（0027），'
  '因为 profiles 的 select 策略是 using(true)，直接放列上等于全站可见。';
