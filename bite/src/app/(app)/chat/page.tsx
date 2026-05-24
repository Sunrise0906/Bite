import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import { listConversations, loadMessages } from "@/lib/db/chat";
import { ChatView } from "@/components/chat/chat-view";
import { ConvoMenu } from "@/components/chat/convo-menu";
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
      // 把"只含 tool_result"的 user 消息折进上一条 assistant，让 UI 配对显示
      for (const row of rows) {
        const onlyToolResult =
          row.role === "user" &&
          row.content.every((b) => b.type === "tool_result");
        if (onlyToolResult && initialMessages.length > 0) {
          const last = initialMessages[initialMessages.length - 1];
          if (last.role === "assistant") {
            last.content = [...last.content, ...row.content];
            continue;
          }
        }
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
                  <li key={c.id} className="group relative">
                    <Link
                      href={`/chat?c=${c.id}`}
                      className={`block truncate rounded-lg py-2 pl-3 pr-8 text-sm transition ${
                        isActive
                          ? "bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                          : "text-zinc-700 hover:bg-white"
                      }`}
                    >
                      {c.title ?? "新对话"}
                    </Link>
                    <div
                      className={`absolute right-1 top-1/2 -translate-y-1/2 ${
                        isActive
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <ConvoMenu
                        conversationId={c.id}
                        currentTitle={c.title}
                      />
                    </div>
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
