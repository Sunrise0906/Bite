-- ============================================================================
-- Bite · Migration 0007 — 加入 Gemini 作为默认免费 provider
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
--
-- 变更：
--   1. user_llm_settings.provider check 扩 'gemini'
--   2. user_llm_settings.provider 默认值切到 'gemini'
--   3. conversations.provider 同步扩
-- ============================================================================

-- ---- user_llm_settings -----------------------------------------------------
alter table public.user_llm_settings
  drop constraint if exists user_llm_settings_provider_check;

alter table public.user_llm_settings
  add constraint user_llm_settings_provider_check
  check (provider in ('gemini', 'anthropic', 'openai', 'deepseek', 'qwen'));

alter table public.user_llm_settings
  alter column provider set default 'gemini';

-- ---- conversations ---------------------------------------------------------
-- conversations.provider 没显式 check（设计文档里没加），但 default 改一下保持一致
alter table public.conversations
  alter column provider set default 'gemini';
