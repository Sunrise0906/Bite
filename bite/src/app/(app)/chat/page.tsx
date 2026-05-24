import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import { listConversations, loadMessages } from "@/lib/db/chat";
import { ChatView } from "@/components/chat/chat-view";
import type { LlmContentBlock } from "@/lib/llm/types";

type SearchParams = { c?: string };

export default async function ChatPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const { c: activeId } = await props.searchParams;

  const conversations = await listConversations(supabase, user.id, 30);

  const initialMessages: Array<{
    role: "user" | "assistant";
    content: LlmContentBlock[];
  }> = [];

  if (activeId) {
    // 安全：listConversations 已经过 RLS，但额外校验 activeId 属于用户
    const found = conversations.find((c) => c.id === activeId);
    if (found) {
      const rows = await loadMessages(supabase, activeId);
      for (const row of rows) {
        initialMessages.push({ role: row.role, content: row.content });
      }
    }
  }

  const hasActive = Boolean(
    activeId && conversations.some((c) => c.id === activeId),
  );

  return (
    <div className="mx-auto flex h-[calc(100dvh-64px)] w-full max-w-6xl flex-col sm:flex-row">
      {/* ---- Sidebar：会话列表 ---- */}
      <aside className="border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)] sm:w-64 sm:border-b-0 sm:border-r">
        <div className="flex items-center justify-between px-4 py-3 sm:flex-col sm:items-stretch sm:gap-3">
          <h1 className="heading-display text-lg sm:text-xl">聊天</h1>
          <Link
            href="/chat"
            className="btn-secondary px-3 py-1.5 text-xs sm:text-sm"
          >
            + 新对话
          </Link>
        </div>
        <nav className="hidden max-h-[calc(100dvh-64px-72px)] overflow-y-auto px-2 pb-3 sm:block">
          {conversations.length === 0 ? (
            <p className="px-2 text-xs text-zinc-500">还没有对话</p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/chat?c=${c.id}`}
                      className={`block truncate rounded-lg px-3 py-2 text-sm transition ${
                        isActive
                          ? "bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                          : "text-zinc-700 hover:bg-white"
                      }`}
                    >
                      {c.title ?? "新对话"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* mobile: 水平滚动 */}
        {conversations.length > 0 && (
          <nav className="overflow-x-auto px-2 pb-2 sm:hidden">
            <ul className="flex gap-1.5">
              {conversations.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <li key={c.id} className="shrink-0">
                    <Link
                      href={`/chat?c=${c.id}`}
                      className={`block max-w-[140px] truncate rounded-full px-3 py-1 text-xs ${
                        isActive
                          ? "bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                          : "bg-white text-zinc-600"
                      }`}
                    >
                      {c.title ?? "新对话"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </aside>

      {/* ---- Main：消息 + 输入 ---- */}
      <section className="flex-1 overflow-hidden">
        <ChatView
          key={activeId ?? "new"}
          initialConversationId={hasActive ? (activeId as string) : null}
          initialMessages={initialMessages}
        />
      </section>
    </div>
  );
}
