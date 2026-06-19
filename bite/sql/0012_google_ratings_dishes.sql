-- ============================================================================
-- Bite · Migration 0012 — Google 口碑评分 + 招牌菜字段
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run（幂等，可重复跑）
--
-- 加了什么：
--   A. Google 口碑：给 places 存 Google Maps 的评分 / 评价数 / 地图链接
--      （google_place_id 在 0001 已有；精确坐标复用现有 lat/lng）。
--      用于详情/卡片显示「★4.3 · 1.2k 评价 · 来自 Google」+ 把地图做准。
--   B. 招牌菜：AI 抽取小红书/文本时存下网友推荐的具体菜，详情显示、聊天能推到菜。
-- ============================================================================

alter table public.places
  add column if not exists google_rating numeric(2, 1),       -- 1.0–5.0
  add column if not exists google_rating_count integer,        -- 评价数
  add column if not exists google_maps_uri text,               -- Google 地图链接
  add column if not exists dishes text[] not null default '{}'::text[]; -- 招牌/推荐菜
