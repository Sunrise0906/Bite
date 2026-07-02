-- ============================================================================
-- Bite · Migration 0016 — 清单 category（多领域地基）
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run（幂等，可重复跑）
--
-- 愿景：Bite 从"吃"延伸到"玩乐"等领域——不同 category 的清单互相配合，
-- AI 聊天跨类综合分析（"吃完去哪玩"）。本迁移只打地基：
--   lists.category（food 吃 / drink 喝 / activity 玩 / other 其他），默认 food，
--   现有清单全部自动归为 food，零行为变化。
-- 应用层：建清单可选类别、AI search_my_list 支持按类过滤 + 返回每家店所属类别。
-- ============================================================================

alter table public.lists
  add column if not exists category text not null default 'food';

alter table public.lists drop constraint if exists lists_category_check;
alter table public.lists add constraint lists_category_check
  check (category in ('food', 'drink', 'activity', 'other'));
