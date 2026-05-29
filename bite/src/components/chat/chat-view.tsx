"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LlmContentBlock } from "@/lib/llm/types";
import {
  labelForTool,
  summarizeToolResult,
  tryPrettyJson,
} from "@/lib/llm/tool-summary";
import { parseLinkifiedSegments } from "@/lib/chat/linkify";

type DisplayMessage = {
  role: "user" | "assistant";
  content: LlmContentBlock[];
  createdAt?: string;
  /** assistant 流式中 */
  streaming?: boolean;
};

type Props = {
  initialConversationId: string | null;
  initialMessages: DisplayMessage[];
  headerTitle: string | null;
  headerProviderLabel: string;
  headerModel: string;
  placeMap: Record<string, { id: string; list_id: string }>;
};

const QUICK_PROMPTS = [
  "今晚一个人吃啥",
  "明天约会，日料 200 内",
  "周末和朋友聚会",
  "想吃面，省时间",
];

const INPUT_MAX = 4000;
const INPUT_WARN = 3500;

// 切换 conversation 时父组件用 key 强制重挂，避免在 effect 里 sync prop → state
export function ChatView({
  initialConversationId,
  initialMessages,
  headerTitle,
  headerProviderLabel,
  headerModel,
  placeMap,
}: Props) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 智能 auto-scroll：只在用户已经在底部时跟随
  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  // textarea 自适应高度
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    stickToBottomRef.current = atBottom;
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function send(opts: { text?: string; regenerate?: boolean } = {}) {
    const isRegen = opts.regenerate === true;
    const text = isRegen ? "" : (opts.text ?? input).trim();
    if (sending) return;
    if (!isRegen && !text) return;
    if (isRegen && !conversationId) return;
    // 用 send 开始那一刻的 conversationId 判定是不是新对话——meta 回来时
    // 会 setConversationId(newId)，之后再读 conversationId 不可靠
    const isNewConvo = conversationId === null;
    if (!isRegen && opts.text === undefined) setInput("");
    setSending(true);
    setError(null);
    setLastFailedText(null);
    stickToBottomRef.current = true;

    const ac = new AbortController();
    abortRef.current = ac;

    if (!isRegen) {
      // 立即把用户消息推上去 + assistant 占位
      setMessages((prev) => [
        ...prev,
        { role: "user", content: [{ type: "text", text }] },
        { role: "assistant", content: [], streaming: true },
      ]);
    } else {
      // 重新生成：弹掉最后一条 assistant（含 tool 卡），换成新占位
      setMessages((prev) => {
        const next = [...prev];
        while (next.length > 0 && next[next.length - 1].role === "assistant") {
          next.pop();
        }
        next.push({ role: "assistant", content: [], streaming: true });
        return next;
      });
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegen
            ? { conversation_id: conversationId, regenerate: true }
            : { conversation_id: conversationId, message: text },
        ),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const msg = await res.text();
        throw new Error(msg || "AI 调用失败");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const blocks: LlmContentBlock[] = [];
      let currentText = "";
      let newConvoId: string | null = null;

      const flushToState = () => {
        const finalBlocks: LlmContentBlock[] = [...blocks];
        if (currentText) finalBlocks.push({ type: "text", text: currentText });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: finalBlocks,
            streaming: true,
          };
          return next;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n\n")) !== -1) {
          const eventStr = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 2);
          const line = eventStr.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            handleEvent(ev);
          } catch {
            // ignore malformed
          }
        }
      }

      // 流结束
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, streaming: false };
        }
        return next;
      });

      // 流结束后让 Next.js router 状态跟 URL bar 对齐
      // - 新对话：meta 事件时已用 native replaceState 改了 URL bar 但 Next router
      //   不知道。这里调 router.replace 让 router 状态也对齐，sidebar active
      //   高亮才正确。此时 DB 已有完整 assistant 消息，ChatView 重挂的
      //   initialMessages = 当前 local state，视觉无明显变化。
      // - 已有对话：URL 没变，router.refresh 触发 sidebar / metadata 重 fetch。
      if (isNewConvo && newConvoId) {
        router.replace(`/chat?c=${newConvoId}`);
      } else {
        router.refresh();
      }

      // ---- 事件分发 ----
      function handleEvent(ev: { type: string; [k: string]: unknown }) {
        switch (ev.type) {
          case "meta": {
            newConvoId = (ev.conversation_id as string) ?? null;
            // 第一时间把 URL 切到带 c=<id>，避免用户中途刷新丢上下文。
            // 用 native history.replaceState 而不是 router.replace——后者会触发
            // Next.js 重 render 父 page，导致 ChatView key=activeId 从 "new"
            // 变成新 id 触发 unmount + remount，stream 当场中断。native API
            // 只改 URL bar，Next router 状态不变，组件继续挂着接 stream。
            // 流结束后 router.refresh 会重 sync 状态（sidebar 显示新对话）。
            if (newConvoId && newConvoId !== conversationId) {
              setConversationId(newConvoId);
              window.history.replaceState(null, "", `/chat?c=${newConvoId}`);
            }
            break;
          }
          case "text": {
            currentText += ev.delta as string;
            flushToState();
            break;
          }
          case "tool_use_start": {
            if (currentText) {
              blocks.push({ type: "text", text: currentText });
              currentText = "";
            }
            blocks.push({
              type: "tool_use",
              id: ev.id as string,
              name: ev.name as string,
              input: {},
            });
            flushToState();
            break;
          }
          case "tool_use_done": {
            const idx = blocks.findIndex(
              (b) => b.type === "tool_use" && b.id === ev.id,
            );
            if (idx !== -1) {
              blocks[idx] = {
                type: "tool_use",
                id: ev.id as string,
                name: ev.name as string,
                input: ev.input,
              };
            }
            flushToState();
            break;
          }
          case "tool_result": {
            blocks.push({
              type: "tool_result",
              tool_use_id: ev.id as string,
              content: ev.result as string,
            });
            flushToState();
            break;
          }
          case "done":
            break;
          case "error": {
            setError((ev.message as string) ?? "AI 调用失败");
            if (!isRegen) setLastFailedText(text);
            break;
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // 用户主动 stop：保留已生成内容，去掉 streaming 标
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            // 如果完全没内容就直接删掉，避免空气泡
            if (last.content.length === 0) {
              next.pop();
            } else {
              next[next.length - 1] = { ...last, streaming: false };
            }
          }
          return next;
        });
      } else {
        const msg = err instanceof Error ? err.message : "网络错误";
        setError(msg);
        if (!isRegen) setLastFailedText(text);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && last.content.length === 0) {
            next.pop();
          }
          return next;
        });
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function retry() {
    if (!lastFailedText) return;
    // 把上一条失败的用户消息撤掉，让 send() 重新推
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (
        last?.role === "user" &&
        last.content[0]?.type === "text" &&
        last.content[0].text === lastFailedText
      ) {
        next.pop();
      }
      return next;
    });
    send({ text: lastFailedText });
  }

  function regenerate() {
    send({ regenerate: true });
  }

  const inputLen = input.length;
  const overLimit = inputLen > INPUT_MAX;
  const showCounter = inputLen >= INPUT_WARN;

  return (
    <div className="flex h-[calc(100dvh-128px)] flex-col sm:h-[calc(100dvh-72px)]">
      {/* ---- 顶栏：标题 + provider/model ---- */}
      <ChatHeader
        title={headerTitle}
        providerLabel={headerProviderLabel}
        model={headerModel}
        hasConvo={conversationId !== null}
      />

      {/* ---- 消息列表 ---- */}
      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && (
            <EmptyState
              onPick={(prompt) => send({ text: prompt })}
              disabled={sending}
            />
          )}
          {messages.map((m, i) => {
            const isLastAssistant =
              i === messages.length - 1 &&
              m.role === "assistant" &&
              !m.streaming &&
              m.content.length > 0;
            return (
              <MessageBubble
                key={i}
                message={m}
                placeMap={placeMap}
                onRegenerate={
                  isLastAssistant && conversationId ? regenerate : undefined
                }
              />
            );
          })}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div>⚠ {error}</div>
              {lastFailedText && (
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 rounded-md bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-800"
                >
                  重试
                </button>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ---- 输入框 ---- */}
      <div className="border-t border-[var(--border-subtle)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (sending) stop();
              else send({});
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!sending) send({});
                }
              }}
              placeholder="今晚和女朋友吃啥？想要日料、200 块以内…"
              rows={1}
              disabled={sending}
              className="field-input flex-1 resize-none overflow-y-auto py-2.5 leading-relaxed"
              style={{ maxHeight: 160 }}
            />
            {sending ? (
              <button
                type="button"
                onClick={stop}
                className="btn-secondary shrink-0 px-4 py-2.5 text-sm"
              >
                停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || overLimit}
                className="btn-primary shrink-0 px-4 py-2.5 text-sm"
              >
                发送
              </button>
            )}
          </form>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <p className="text-zinc-400">Enter 发送，Shift+Enter 换行</p>
            {showCounter && (
              <p
                className={
                  overLimit ? "font-medium text-red-700" : "text-amber-700"
                }
              >
                {inputLen.toLocaleString()} / {INPUT_MAX.toLocaleString()}
                {overLimit && " · 超出上限"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatHeader({
  title,
  providerLabel,
  model,
  hasConvo,
}: {
  title: string | null;
  providerLabel: string;
  model: string;
  hasConvo: boolean;
}) {
  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-strong)]">
            {hasConvo ? (title ?? "新对话") : "新对话"}
          </p>
        </div>
        {providerLabel && (
          <div
            className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-[11px] text-zinc-600"
            title={model ? `model: ${model}` : ""}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="font-medium">{providerLabel}</span>
            {model && <span className="text-zinc-400">· {shortModel(model)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function shortModel(m: string): string {
  // 把过长的 model id 缩成 12 字以内
  if (m.length <= 16) return m;
  return m.slice(0, 14) + "…";
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <p className="heading-display text-xl text-[var(--text-strong)]">
        和你的餐厅库聊聊
      </p>
      <p className="mt-2 max-w-sm text-sm text-zinc-600">
        告诉我你想吃啥 / 跟谁 / 预算多少，我从你的 list 里挑 2-3 家并给出理由。
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-1.5">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            disabled={disabled}
            className="rounded-full border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  placeMap,
  onRegenerate,
}: {
  message: DisplayMessage;
  placeMap: Record<string, { id: string; list_id: string }>;
  onRegenerate?: () => void;
}) {
  const isUser = message.role === "user";

  // 把 tool_use 和它对应的 tool_result 配对渲染
  const paired = useMemo(() => {
    const items: Array<
      | { kind: "text"; text: string }
      | {
          kind: "tool";
          use: Extract<LlmContentBlock, { type: "tool_use" }>;
          result?: Extract<LlmContentBlock, { type: "tool_result" }>;
        }
    > = [];
    const resultsById = new Map<
      string,
      Extract<LlmContentBlock, { type: "tool_result" }>
    >();
    for (const b of message.content) {
      if (b.type === "tool_result") resultsById.set(b.tool_use_id, b);
    }
    for (const b of message.content) {
      if (b.type === "text") items.push({ kind: "text", text: b.text });
      else if (b.type === "tool_use") {
        items.push({ kind: "tool", use: b, result: resultsById.get(b.id) });
      }
      // tool_result 已经配对，不单独渲染
    }
    return items;
  }, [message.content]);

  // 给 assistant 复制按钮：抓所有 text block 拼起来
  const assistantText = !isUser
    ? message.content
        .filter(
          (b): b is Extract<LlmContentBlock, { type: "text" }> => b.type === "text",
        )
        .map((b) => b.text)
        .join("\n")
        .trim()
    : "";

  const hoverTime = formatHoverTime(message.createdAt);
  const briefTime = formatBriefTime(message.createdAt);

  return (
    <div
      className={`group flex flex-col gap-1 ${
        isUser ? "items-end" : "items-start"
      }`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-[var(--primary)] text-white"
            : "bg-white border border-[var(--border-subtle)] text-[var(--text-default)]"
        }`}
      >
        {message.content.length === 0 && message.streaming && (
          <span className="inline-flex gap-1 text-zinc-400">
            <Dot delay={0} />
            <Dot delay={150} />
            <Dot delay={300} />
          </span>
        )}
        {paired.map((item, i) =>
          item.kind === "text" ? (
            <LinkifiedText
              key={i}
              text={item.text}
              placeMap={placeMap}
              linkClassName={
                isUser
                  ? "underline decoration-white/40 underline-offset-2 hover:decoration-white"
                  : "text-[var(--primary)] underline decoration-[var(--primary)]/40 underline-offset-2 hover:decoration-[var(--primary)]"
              }
            />
          ) : (
            <ToolCallCard
              key={item.use.id}
              use={item.use}
              result={item.result}
            />
          ),
        )}
        {message.streaming && message.content.length > 0 && (
          <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-current align-baseline opacity-50" />
        )}
      </div>

      {/* 时间戳 + 复制按钮：触屏设备永远显示；hover 设备 hover 才显示 */}
      <div
        className={`flex items-center gap-2 px-1 text-[10px] text-zinc-400 transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${
          isUser ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {briefTime && (
          <time
            dateTime={message.createdAt}
            title={hoverTime}
            className="cursor-default"
          >
            {briefTime}
          </time>
        )}
        {!isUser && assistantText && !message.streaming && (
          <CopyButton text={assistantText} />
        )}
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-md px-1.5 py-0.5 text-zinc-500 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-strong)]"
            title="重新生成这条回复"
          >
            ↻ 重新生成
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 把文本里的 «店名» 渲染成可点击链接（如果店名在 placeMap 里）；
 * 没匹配上的 «...» 原样显示，普通文本走 whitespace-pre-wrap。
 */
function LinkifiedText({
  text,
  placeMap,
  linkClassName,
}: {
  text: string;
  placeMap: Record<string, { id: string; list_id: string }>;
  linkClassName: string;
}) {
  const parts = parseLinkifiedSegments(text, placeMap);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((p, i) => {
        if (p.kind === "text") return <span key={i}>{p.text}</span>;
        if (p.kind === "raw") return <span key={i}>{p.text}</span>;
        return (
          <Link key={i} href={p.href} className={linkClassName}>
            {p.name}
          </Link>
        );
      })}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore
        }
      }}
      className="rounded-md px-1.5 py-0.5 text-zinc-500 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-strong)]"
      title="复制回复"
    >
      {copied ? "已复制 ✓" : "复制"}
    </button>
  );
}

function formatBriefTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}/${day} ${hh}:${mm}`;
}

function formatHoverTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ToolCallCard({
  use,
  result,
}: {
  use: Extract<LlmContentBlock, { type: "tool_use" }>;
  result?: Extract<LlmContentBlock, { type: "tool_result" }>;
}) {
  const status = summarizeToolResult(use.name, result?.content);
  const isRunning = !result;
  const isError = result && status.kind === "error";
  // 用户没显式切换前，错误默认展开
  const [userToggle, setUserToggle] = useState<boolean | null>(null);
  const expanded = userToggle === null ? Boolean(isError) : userToggle;

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-xs">
      <button
        type="button"
        onClick={() => setUserToggle(!expanded)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-white/50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`font-mono ${
              isError ? "text-red-600" : "text-[var(--primary)]"
            }`}
          >
            {isRunning ? "⏳" : isError ? "✗" : "✓"} {labelForTool(use.name)}
          </span>
          <span className="truncate text-zinc-600">{status.summary}</span>
        </span>
        <span className="shrink-0 text-zinc-400">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] bg-white/60 px-2.5 py-2">
          {use.input != null &&
            typeof use.input === "object" &&
            Object.keys(use.input as object).length > 0 && (
              <div className="mb-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  参数
                </div>
                <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] text-zinc-700">
                  {JSON.stringify(use.input, null, 2)}
                </pre>
              </div>
            )}
          {result && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                结果
              </div>
              <pre className="mt-0.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-zinc-700">
                {tryPrettyJson(result.content)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
