// 会话 / 消息持久化助手。仅在 server 用。

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmContentBlock, ProviderId } from "@/lib/llm/types";

export type ConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  provider: ProviderId;
  model: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRole = "user" | "assistant";

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: LlmContentBlock[];
  usage: Record<string, number> | null;
  stop_reason: string | null;
  created_at: string;
};

export async function createConversation(
  supabase: SupabaseClient,
  args: {
    userId: string;
    provider: ProviderId;
    model: string;
    title?: string | null;
  },
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: args.userId,
      provider: args.provider,
      model: args.model,
      title: args.title ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

export async function listConversations(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<ConversationRow[]> {
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ConversationRow[];
}

export async function getConversation(
  supabase: SupabaseClient,
  id: string,
  userId: string,
): Promise<ConversationRow | null> {
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle<ConversationRow>();
  return data ?? null;
}

export async function loadMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<MessageRow[]> {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as MessageRow[];
}

export async function appendMessage(
  supabase: SupabaseClient,
  args: {
    conversationId: string;
    role: MessageRole;
    content: LlmContentBlock[];
    usage?: Record<string, number> | null;
    stopReason?: string | null;
  },
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: args.conversationId,
      role: args.role,
      content: args.content,
      usage: args.usage ?? null,
      stop_reason: args.stopReason ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  // bump conversation updated_at（不更新会让 list 顺序乱）
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", args.conversationId);
  return { id: data.id };
}

export async function updateConversationTitle(
  supabase: SupabaseClient,
  id: string,
  title: string,
): Promise<void> {
  await supabase
    .from("conversations")
    .update({ title })
    .eq("id", id)
    .is("title", null); // 只在还没标题时设
}

export async function deleteConversation(
  supabase: SupabaseClient,
  id: string,
  userId: string,
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  return { ok: true };
}
