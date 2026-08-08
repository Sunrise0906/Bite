-- ============================================================================
-- Bite · Migration 0004 — places.photo_url 字段
--
-- ⚠️⚠️ 已被 0005_photo_urls_array.sql 取代。**全新数据库不要跑这个文件。**
--   0005 会把 photo_url 迁进 photo_urls[0] 然后 drop 掉该列。本文件用的是
--   `add column if not exists`，所以在 0005 之后重放会**静默**加回一个没人读的
--   死列（不报错，你不会发现）。仅作历史保留。
--
-- 用法（仅历史参考）：Supabase Dashboard → SQL Editor → 粘贴 → Run
--
-- 用途：从小红书帖子抓到的第一张图片 URL，或手动添加时用户贴的图。
-- ============================================================================

alter table public.places
  add column if not exists photo_url text;
