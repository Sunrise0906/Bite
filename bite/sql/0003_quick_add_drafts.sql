-- ============================================================================
-- Bite · Migration 0003 — quick_add_drafts 表
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴并 Run
--
-- 用途：把 AI 解析后的 draft 从 cookie（4KB 上限）搬到服务端表，
--      支持 N 家店的合集帖 + 富 notes 信息。
--
-- 设计：
--   - 每用户一行（user_id PRIMARY KEY），新草稿 UPSERT 覆盖旧的
--   - data jsonb：存整个 QuickAddDraft 结构
--   - updated_at：用来判断 10 分钟 TTL
--   - RLS：用户只能读/写自己的草稿
-- ============================================================================

create table public.quick_add_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index quick_add_drafts_updated_at_idx
  on public.quick_add_drafts(updated_at desc);

create trigger quick_add_drafts_set_updated_at
  before update on public.quick_add_drafts
  for each row execute function public.set_updated_at();

alter table public.quick_add_drafts enable row level security;

-- 用户只能管自己的草稿
create policy "drafts_select_self"
  on public.quick_add_drafts for select
  to authenticated
  using (user_id = auth.uid());

create policy "drafts_insert_self"
  on public.quick_add_drafts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "drafts_update_self"
  on public.quick_add_drafts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "drafts_delete_self"
  on public.quick_add_drafts for delete
  to authenticated
  using (user_id = auth.uid());
