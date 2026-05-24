-- ============================================================================
-- Bite · Migration 0006 — LLM 设置 + 聊天历史
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run
--
-- 表：
--   user_llm_settings — 每用户的 LLM 偏好（provider / key / model）
--   conversations    — 一次聊天会话
--   messages         — 会话里的消息（含 tool_use / tool_result blocks）
-- ============================================================================

-- ---- user_llm_settings -----------------------------------------------------
create table public.user_llm_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'anthropic'
    check (provider in ('anthropic', 'openai', 'deepseek', 'qwen')),
  -- 用户自带 key（null = 走 app 默认 key）。
  -- 注意：当前以明文存，RLS 限制只能自己读；后续可改成 vault / 加密。
  api_key text,
  -- 可选 base_url 覆盖（自托管 endpoint 或代理）
  base_url text,
  -- 可选 model 覆盖（不填走 provider 默认）
  chat_model text,
  extract_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_llm_settings_set_updated_at
  before update on public.user_llm_settings
  for each row execute function public.set_updated_at();

alter table public.user_llm_settings enable row level security;

create policy "llm_settings_select_self"
  on public.user_llm_settings for select
  to authenticated
  using (user_id = auth.uid());

create policy "llm_settings_insert_self"
  on public.user_llm_settings for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "llm_settings_update_self"
  on public.user_llm_settings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "llm_settings_delete_self"
  on public.user_llm_settings for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- conversations ---------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  -- 用本次会话开始时用户用的 provider/model；切换 provider 时新对话生效
  provider text not null default 'anthropic',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_idx
  on public.conversations(user_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

create policy "conversations_select_self"
  on public.conversations for select
  to authenticated
  using (user_id = auth.uid());

create policy "conversations_insert_self"
  on public.conversations for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "conversations_update_self"
  on public.conversations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "conversations_delete_self"
  on public.conversations for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- messages --------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- content 是 [{type, ...}] 数组，支持 text / tool_use / tool_result blocks
  content jsonb not null,
  -- 用量统计（assistant 消息记录这次 LLM 调用消耗）
  usage jsonb,
  -- stop_reason: 'end_turn' / 'tool_use' / 'max_tokens' / 'refusal' 等
  stop_reason text,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx
  on public.messages(conversation_id, created_at);

alter table public.messages enable row level security;

-- 通过 conversation 的 user_id 反查权限
create policy "messages_select_via_conv"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "messages_insert_via_conv"
  on public.messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "messages_delete_via_conv"
  on public.messages for delete
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
