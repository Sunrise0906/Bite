-- ============================================================================
-- Bite · Migration 0020 — 收紧函数暴露面（Supabase 安全顾问的两条真问题）
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
--       （本轮是通过 Supabase MCP 直接 apply 的，文件留档以便重建库）
-- 顺序：纯加固，不改任何业务语义，先跑后跑都行。
--
-- ---------------------------------------------------------------------------
-- 来源：get_advisors(type=security)。顾问一共报了 16 条，其中大部分是**假阳性**，
-- 只有下面两类需要处理。判断依据记在这里，免得下次又被同一批告警晃到。
--
-- ❌ 不要动的（假阳性）：can_read_list / can_write_list 被 13 条 RLS 策略引用
--    （lists / list_members / places / visit_logs / pick_sessions / pick_votes）。
--    RLS 策略表达式是以**调用者身份**求值的，所以 authenticated 必须有 EXECUTE。
--    回收它们会让整个应用的 RLS 直接崩。顾问看不到这层依赖关系。
--
-- ✅ 本文件处理的两条：
--    1. set_updated_at 没设 search_path（其他函数都设了，只有它漏了）
--    2. 三个触发器函数被暴露成了 PostgREST 的 RPC 端点
-- ============================================================================

-- ---- 1. set_updated_at 补上 search_path ------------------------------------
-- 它是 SECURITY INVOKER（不是 DEFINER），所以可变 search_path 的危害有限，
-- 但补上是零成本的：函数体里用到 now()，锁死 search_path 可以防止调用方
-- 通过 search_path 劫持解析到别的同名对象。
-- 函数体与原定义完全一致，只加 SET search_path。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- 2. 触发器函数不该出现在 REST API 里 ------------------------------------
-- handle_new_user / rls_auto_enable / lists_guard_update 都是触发器函数，
-- 却因为 public schema 的默认 EXECUTE 授权而暴露成了
-- /rest/v1/rpc/<name> 端点，anon 和 authenticated 都能打。
--
-- 实际**不可利用** —— PL/pgSQL 触发器函数被直接调用时会报
-- "trigger functions can only be called as triggers"，event trigger 同理。
-- 但它们本来就不该在 API 表面上。
--
-- 回收是安全的：触发器由表的属主身份执行，**不看调用者的 EXECUTE 权限**。
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.lists_guard_update() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- ---- 3. 自检 ---------------------------------------------------------------
-- 跑完确认：
--   -- search_path 已设：
--   select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname='set_updated_at';
--
--   -- 三个触发器函数对 anon/authenticated 应为 false：
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public'
--     and p.proname in ('handle_new_user','lists_guard_update','rls_auto_enable',
--                       'can_read_list','can_write_list');
--   -- can_read_list / can_write_list 的 auth 必须仍为 true！
