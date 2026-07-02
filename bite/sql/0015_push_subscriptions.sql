-- ============================================================================
-- Bite · Migration 0015 — Web Push 订阅表
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run（幂等，可重复跑）
--
-- 浏览器推送订阅（PWA 通知：收到推荐 / 共享清单加新店 / 一起选匹配）。
-- endpoint + keys 等价于"能给这个人发通知"的凭证 → RLS 只允许本人读写自己的；
-- 服务端跨用户发推送走 service role（lib/push/send.ts，未配则静默跳过）。
-- ============================================================================

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subs_own" on public.push_subscriptions;
create policy "push_subs_own"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
