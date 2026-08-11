-- ============================================================================
-- Bite · Migration 0023 — conversations.scope_list_id（「从这个清单里挑」的作用域）
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
--       （本轮通过 Supabase MCP 直接 apply，文件留档以便重建库）
-- 顺序：纯增量。
--
-- ---------------------------------------------------------------------------
-- 背景：清单页的「帮我从这挑」跳 /chat?list=<id>，AI 只从该清单挑。
-- 但发出第一条消息后 ChatView 会 router.replace 到 /chat?c=<新会话id>
-- （那是为了修「流式期间 URL 变化导致组件重挂、回复中断」而做的），
-- **?list= 就被丢掉了** —— 第二条消息开始作用域失效，重新打开这个会话也一样。
--
-- 作用域本质是**会话的属性**（这个对话是在聊哪个清单），所以存在会话行上，
-- 而不是靠 URL 参数在客户端来回传。这样刷新、换设备、翻历史都不会丢。
--
-- on delete set null：清单被删掉时会话保留，只是退回「全部清单」范围。
-- ============================================================================

alter table public.conversations
  add column if not exists scope_list_id uuid
    references public.lists(id) on delete set null;

comment on column public.conversations.scope_list_id is
  '这个对话限定在哪个清单里挑（来自清单页的「帮我从这挑」）。null = 不限。';
