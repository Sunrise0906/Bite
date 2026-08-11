-- 0025：清单内评论 —— 全应用第一个「人对人」的数据结构
--
-- 在这之前，两个人之间只有三条异步单向通道：推荐一家店（对方 accept/decline，
-- 无法回复）、邀请链接、一起选的盲投票。places.reasons 每人只能留一条、
-- 要改就是覆盖，天然不能对话。conversations/messages 是纯人机的
-- （role CHECK 只有 user/assistant，RLS 是 user_id = auth.uid()），改造它会污染
-- 送给 LLM 的 history 序列化，所以另起一张表。
--
-- ⚠️ 需要在 Supabase SQL Editor 里手工执行（本仓库没有 migration ledger，
-- 权威清单见 bite/README.md → 数据库初始化）。

create table if not exists public.place_comments (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  -- 冗余一份 list_id：RLS 才能直接调 can_read_list 而不用每次 join places
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists place_comments_place_idx
  on public.place_comments(place_id, created_at);
create index if not exists place_comments_list_idx
  on public.place_comments(list_id, created_at desc);

alter table public.place_comments enable row level security;

-- 读：清单里的人都能读
create policy "place_comments_select_readers"
  on public.place_comments for select
  to authenticated
  using (public.can_read_list(list_id));

-- 写：**can_read_list 而不是 can_write_list** —— viewer 也该能说话。
-- 与 pick_votes 的口径一致（只读成员同样能参与一起选投票）：
-- 「不能改清单内容」和「不能开口」是两回事。
create policy "place_comments_insert_readers"
  on public.place_comments for insert
  to authenticated
  with check (public.can_read_list(list_id) and user_id = auth.uid());

-- 改 / 删：只能动自己的
create policy "place_comments_update_own"
  on public.place_comments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "place_comments_delete_own"
  on public.place_comments for delete
  to authenticated
  using (user_id = auth.uid());

-- updated_at 自动维护（set_updated_at 在 0001 建好，0020 加固了 search_path）
drop trigger if exists place_comments_set_updated_at on public.place_comments;
create trigger place_comments_set_updated_at
  before update on public.place_comments
  for each row execute function public.set_updated_at();

comment on table public.place_comments is
  '店铺评论：清单成员之间的对话。viewer 也能发（口径同 pick_votes）。';
