-- ============================================================================
-- Bite · Migration 0005 — photo_url → photo_urls text[]
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
--
-- 用途：支持小红书帖子多图轮播（一篇通常 6-9 张图）。
-- ============================================================================

-- 1. 加新数组列（如果已有就跳过）
alter table public.places
  add column if not exists photo_urls text[] not null default '{}';

-- 2. 把旧的 photo_url 迁移到 photo_urls[0]
update public.places
set photo_urls = array[photo_url]
where photo_url is not null
  and (photo_urls is null or array_length(photo_urls, 1) is null);

-- 3. 删除旧列
alter table public.places drop column if exists photo_url;
