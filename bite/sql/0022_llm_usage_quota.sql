-- ============================================================================
-- Bite · Migration 0022 — 按用户的每日 AI 调用配额（只在用 app 默认 key 时计）
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
--       （本轮通过 Supabase MCP 直接 apply，文件留档以便重建库）
-- 顺序：纯增量，先跑后跑都行（旧代码不读这张表）。
--
-- ---------------------------------------------------------------------------
-- 背景
--
-- CLAUDE.md 的产品承诺是「App 默认 LLM key 由开发者出，朋友/女朋友开箱即用」。
-- 实测：5 个注册用户，**0 个自带 key** —— 五个人全在用同一把 GEMINI_API_KEY。
--
-- 而 Gemini 的免费额度是**按 key（按 Google Cloud 项目）算的，不是按终端用户算的**。
-- 所以一个人连着加店就会把所有人的额度一起抽干，别人同时就撞「限流」。
-- 这正是 docs/decisions/0003-llm-cost-ceiling.md 记的那个未决问题。
--
-- 这张表按 (user_id, UTC 日期) 记调用次数，只在走 app 默认 key 时累加 ——
-- 用户自带 key 花的是他自己的额度，不该受限也不该记在这里。
-- ============================================================================

create table if not exists public.llm_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  calls   int  not null default 0,
  primary key (user_id, day)
);

comment on table public.llm_usage is
  '按用户每日的 AI 调用计数。仅统计使用 app 默认 key 的调用；用户自带 key 不计也不限。';

alter table public.llm_usage enable row level security;

-- 用户只能看自己的用量（写入一律走下面的 SECURITY DEFINER 函数）
drop policy if exists "llm_usage_select_self" on public.llm_usage;
create policy "llm_usage_select_self"
  on public.llm_usage for select
  to authenticated
  using (user_id = auth.uid());

-- ---- 原子地「占一次额度」-----------------------------------------------------
-- 返回 (allowed, used, quota)：
--   allowed=false 时**不会**累加 —— 被拒的尝试不该继续消耗额度，
--   否则用户在超限后每点一次都把计数推得更高，越用越难恢复。
--
-- 用 SECURITY DEFINER + 单条语句完成「读-判-写」，避免并发下多个请求同时通过。
create or replace function public.consume_llm_quota(p_limit int)
returns table (allowed boolean, used int, quota int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_calls int;
begin
  if v_uid is null then
    return query select false, 0, p_limit;
    return;
  end if;

  -- 只在「还没到上限」时才 +1；到了就原样返回当前值
  insert into public.llm_usage (user_id, day, calls)
  values (v_uid, v_today, 1)
  on conflict (user_id, day) do update
    set calls = public.llm_usage.calls + 1
    where public.llm_usage.calls < p_limit
  returning calls into v_calls;

  if v_calls is null then
    -- 冲突行存在但 WHERE 没通过（已达上限）→ 取当前值报给调用方
    select calls into v_calls
    from public.llm_usage
    where user_id = v_uid and day = v_today;
    return query select false, coalesce(v_calls, p_limit), p_limit;
    return;
  end if;

  return query select true, v_calls, p_limit;
end;
$$;

revoke all on function public.consume_llm_quota(int) from public, anon;
grant execute on function public.consume_llm_quota(int) to authenticated;

-- ---- 自检 ------------------------------------------------------------------
--   select * from public.consume_llm_quota(3);  -- 连跑 4 次，第 4 次应 allowed=false
--   select * from public.llm_usage where user_id = auth.uid();
--   delete from public.llm_usage where user_id = auth.uid();  -- 清掉自检数据
