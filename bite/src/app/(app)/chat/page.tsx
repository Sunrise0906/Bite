import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import { listConversations, loadMessages } from "@/lib/db/chat";
import { ChatView } from "@/components/chat/chat-view";
import { ConvoMenu } from "@/components/chat/convo-menu";
import { loadUserLlmSettings, resolveConfig } from "@/lib/llm/router";
import { PROVIDER_LABELS, type LlmContentBlock } from "@/lib/llm/types";
import { signNestedPhotoUrls } from "@/lib/storage/signed-photos";
import { getUiVersion } from "@/lib/ui-version";

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
  // V2 推荐卡需要图/菜系/状态/why；V1 只用 id/list_id（多余字段忽略）
  type PlaceRich = {
    id: string;
    list_id: string;
    photo: string | null;
    cuisine: string[];
    status: string | null;
    price: string | null;
    why: string | null;
  };
  let placeMap: Record<string, PlaceRich> = {};
  if (listIds.length > 0) {
    const { data: placesData } = await supabase
      .from("places")
      .select(
        "id, list_id, name, cuisine, status, price_range, photo_urls, reasons, notes",
      )
      .in("list_id", listIds);
    // 推荐卡封面：自家 Storage 图换 signed URL（photos bucket 私有化）
    const places = placesData ?? [];
    const signedGroups = await signNestedPhotoUrls(
      supabase,
      places.map((p) => (p.photo_urls ?? []) as string[]),
    );
    places.forEach((p, i) => {
      p.photo_urls = signedGroups[i];
    });
    placeMap = Object.fromEntries(
      places.map((p) => {
        const reasons = (p.reasons ?? []) as Array<{
          user_id: string;
          text: string;
        }>;
        const why =
          reasons.find((r) => r.user_id === user.id)?.text ??
          reasons[0]?.text ??
          (p.notes ? String(p.notes).slice(0, 60) : null);
        return [
          p.name,
          {
            id: p.id,
            list_id: p.list_id,
            photo: p.photo_urls?.[0] ?? null,
            cuisine: p.cuisine ?? [],
            status: p.status ?? null,
            price: p.price_range ?? null,
            why,
          },
        ];
      }),
    );
  }

  const uiVersion = await getUiVersion();

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

  // 按 updated_at 分组：今天 / 昨天 / 本周 / 本月 / 更早
  // 长 chat 历史扫起来更快
  function bucketOf(iso: string): "today" | "yesterday" | "week" | "month" | "older" {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "older";
    const now = new Date();
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);
    const startWeek = new Date(startToday);
    startWeek.setDate(startWeek.getDate() - 7);
    const startMonth = new Date(startToday);
    startMonth.setDate(startMonth.getDate() - 30);

    if (d >= startToday) return "today";
    if (d >= startYesterday) return "yesterday";
    if (d >= startWeek) return "week";
    if (d >= startMonth) return "month";
    return "older";
  }
  const BUCKET_LABEL: Record<ReturnType<typeof bucketOf>, string> = {
    today: "今天",
    yesterday: "昨天",
    week: "本周",
    month: "本月",
    older: "更早",
  };
  const BUCKET_ORDER: Array<ReturnType<typeof bucketOf>> = [
    "today",
    "yesterday",
    "week",
    "month",
    "older",
  ];
  const grouped = new Map<ReturnType<typeof bucketOf>, typeof conversations>();
  for (const c of conversations) {
    const b = bucketOf(c.updated_at);
    const arr = grouped.get(b) ?? [];
    arr.push(c);
    grouped.set(b, arr);
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-64px)] w-full max-w-6xl flex-col sm:flex-row">
      {/* ---- Sidebar：会话列表 ---- */}
      <aside className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] sm:w-64 sm:border-b-0 sm:border-r">
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
            <p className="px-3 text-xs text-[var(--text-muted)]">还没有对话</p>
          ) : (
            <div className="space-y-3">
              {BUCKET_ORDER.map((bucket) => {
                const items = grouped.get(bucket);
                if (!items || items.length === 0) return null;
                return (
                  <div key={bucket}>
                    <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {BUCKET_LABEL[bucket]}
                    </p>
                    <ul className="space-y-0.5">
                      {items.map((c) => {
                        const isActive = c.id === activeId;
                        return (
                          <li key={c.id} className="group relative">
                            <Link
                              href={`/chat?c=${c.id}`}
                              className={`block line-clamp-2 rounded-lg py-2 pl-3 pr-10 text-sm leading-snug transition ${
                                isActive
                                  ? "bg-[var(--primary-soft)] font-medium text-[var(--primary-soft-text)]"
                                  : "text-[var(--text-default)] hover:bg-[var(--surface-elevated)]"
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
                  </div>
                );
              })}
            </div>
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
                      className={`block max-w-[160px] truncate rounded-full border py-1 pl-3 pr-9 text-xs transition ${
                        isActive
                          ? "border-transparent bg-[var(--primary-soft)] font-medium text-[var(--primary-soft-text)]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-default)]"
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
          uiVersion={uiVersion}
        />
      </section>
    </div>
  );
}
