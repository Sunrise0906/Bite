-- ============================================================================
-- Bite · Migration 0021 — places.website_uri（「看菜单」直达点单页）
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
--       （本轮通过 Supabase MCP 直接 apply，文件留档以便重建库）
-- 顺序：纯增量，先跑后跑都行（旧代码不读这一列）。
--
-- ---------------------------------------------------------------------------
-- 背景
--
-- 「看菜单」原本是拿「店名 + 地址 + menu 菜单」去开一个 **Google 搜索结果页**，
-- 用户落地后还得自己在一堆 Grubhub / UberEats / Postmates 里找菜单，体验很差。
--
-- 而 Google Places 本来就返回 websiteUri，对餐厅来说它**通常直接就是点单/菜单页**。
-- 实测 MOri's（6280 Scholarship, Irvine）：
--   websiteUri = https://order.toasttab.com/online/moris-6280-scholarship
-- 正是它的 Toast 在线点单菜单本身，而不是官网首页。
--
-- 所以存下这一列，「菜单」优先跳它；没有 websiteUri 的店再退回原来的 Google 搜索。
-- ============================================================================

alter table public.places
  add column if not exists website_uri text;   -- Google Places 的 websiteUri（多为点单/菜单页）

comment on column public.places.website_uri is
  'Google Places websiteUri。餐厅多为在线点单/菜单页（Toast、Square 等），「看菜单」优先跳这里。';

-- 自检：
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='places' and column_name='website_uri';
