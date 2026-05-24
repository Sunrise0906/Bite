-- ============================================================================
-- Bite · Migration 0002 — places.notes 列
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴并 Run
--
-- 用途：保存 AI 对帖子 + 评论区的综合判断（含可能的差评提醒），
--      让未来 Phase 3 的决策聊天 agent 能引用到这些口碑信号。
--
-- 与 places.reasons 的区别：
--   - reasons[]: 多人各写的"想去理由"，主观偏好
--   - notes:     AI 综合判断 / 评论区交叉信号 / 客观提醒
-- ============================================================================

alter table public.places
  add column if not exists notes text;
