import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import { listConversations, loadMessages } from "@/lib/db/chat";
import { ChatView } from "@/components/chat/chat-view";
import { ConvoMenu } from "@/components/chat/convo-menu";
import { loadUserLlmSettings, resolveConfig } from "@/lib/llm/router";
import { PROVIDER_LABELS, type LlmContentBlock } from "@/lib/llm/types";

type SearchParamsForMeta = Promise<{ c?: string }>;

export async function generateMetadata(props: {
  searchParams: SearchParamsForMeta;
}) {
  const { c: activeId } = await props.searchParams;
  if (!activeId) return { title: "聊天 · Bite" };
  // 拉对话标题
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("title")
    .eq("id", activeId)
    .maybeSingle<{ title: string | null }>();
  const t = data?.title?.trim();
  return { title: t ? `${t} · 聊天 · Bite` : "聊天 · Bite" };
}

type SearchParams = { c?: string };

export default async function ChatPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const { c: activeId } = await props.searchParams;

  const conversations = await listConversations(supabase, user.id, 30);

  // 加载用户所有 places 的 (name → id+list_id) 映射，
  // 让 assistant 消息里 «店名» 能渲染成可点击链接
  const { data: ownerLists } = await supabase
    .from("lists")
    .select("id")
    .eq("owner_id", user.id);
  const { data: memberLists } = await supabase
    .from("list_members")
    .select("list_id")
    .eq("user_id", user.id);
  const listIds = [
    ...(ownerLists ?? []).map((l) => l.id),
    ...(memberLists ?? []).map((m) => m.list_id),
  ];
  let placeMap: Record<string, { id: string; list_id: string }> = {};
  if (listIds.length > 0) {
    const { data: places } = await supabase
      .from("places")
      .select("id, list_id, name")
      .in("list_id", listIds);
    placeMap = Object.fromEntries(
      (places ?? []).map((p) => [
        p.name,
        { id: p.id, list_id: p.list_id },
      ]),
    );
  }

  const initialMessages: Array<{
    role: "user" | "assistant";
    content: LlmContentBlock[];
    createdAt?: string;
  }> = [];

  const activeConvo = activeId
    ? (conversations.find((c) => c.id === activeId) ?? null)
    : null;

  if (activeConvo) {
    const rows = await loadMessages(supabase, activeConvo.id);
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
      initialMessages.push({
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
      });
    }
  }

  // 顶栏要显示的 provider/model
  // - 有 active 会话：用会话存的 provider/model
  // - 新对话：用用户当前 settings 解析出的 effective config
  let headerProviderLabel = "";
  let headerModel = "";
  if (activeConvo) {
    headerProviderLabel = PROVIDER_LABELS[activeConvo.provider] ?? activeConvo.provider;
    headerModel = activeConvo.model ?? "";
  } else {
    try {
      const settings = await loadUserLlmSettings();
      const config = resolveConfig(settings);
      headerProviderLabel = PROVIDER_LABELS[config.id];
      headerModel = config.chatModel;
    } catch {
      // 没配 key 也不影响进页面
      headerProviderLabel = "未配置";
      headerModel = "";
    }
  }

  const hasActive = activeConvo !== null;

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
                  <li key={c.id} className="relative shrink-0">
                    <Link
                      href={`/chat?c=${c.id}`}
                      className={`block max-w-[160px] truncate rounded-full py-1 pl-3 pr-7 text-xs ${
                        isActive
                          ? "bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                          : "bg-white text-zinc-600"
                      }`}
                    >
                      {c.title ?? "新对话"}
                    </Link>
                    <div className="absolute right-0.5 top-1/2 -translate-y-1/2">
                      <ConvoMenu
                        conversationId={c.id}
                        currentTitle={c.title}
                      />
                    </div>
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
          headerTitle={activeConvo?.title ?? null}
          headerProviderLabel={headerProviderLabel}
          headerModel={headerModel}
          placeMap={placeMap}
        />
      </section>
    </div>
  );
}
