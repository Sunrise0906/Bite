-- ============================================================================
-- Bite · Migration 0004 — places.photo_url 字段
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
--
-- 用途：从小红书帖子抓到的第一张图片 URL，或手动添加时用户贴的图。
-- ============================================================================

alter table public.places
  add column if not exists photo_url text;
