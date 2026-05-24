"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LlmContentBlock } from "@/lib/llm/types";

type DisplayMessage = {
  role: "user" | "assistant";
  content: LlmContentBlock[];
  /** assistant 流式中 */
  streaming?: boolean;
};

type Props = {
  initialConversationId: string | null;
  initialMessages: DisplayMessage[];
};

// 切换 conversation 时父组件用 key 强制重挂，避免在 effect 里 sync prop → state
export function ChatView({ initialConversationId, initialMessages }: Props) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚到底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setError(null);

    // 立即把用户消息推上去
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: [{ type: "text", text }],
      },
      {
        role: "assistant",
        content: [],
        streaming: true,
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: text,
        }),
      });

      if (!res.ok || !res.body) {
        const msg = await res.text();
        throw new Error(msg || "AI 调用失败");
      }

      // 解析 SSE
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // 流式更新最后一条 assistant 消息
      // 用 ref 风格的本地变量累 blocks
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

        // 按 \n\n 分割 SSE 事件
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

      // 结束：清流式标记
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, streaming: false };
        }
        return next;
      });

      if (newConvoId && newConvoId !== conversationId) {
        setConversationId(newConvoId);
        // 让 server 重新加载侧栏
        router.replace(`/chat?c=${newConvoId}`);
        router.refresh();
      } else {
        router.refresh();
      }

      // ---- 事件分发 ----
      function handleEvent(ev: {
        type: string;
        [k: string]: unknown;
      }) {
        switch (ev.type) {
          case "meta": {
            newConvoId = (ev.conversation_id as string) ?? null;
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
            // 用最终 input 覆盖那个 tool_use
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
          case "error": {
            if (ev.type === "error") {
              setError((ev.message as string) ?? "AI 调用失败");
            }
            break;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "网络错误";
      setError(msg);
      // 把那条占位 assistant 消息标 streaming=false
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.content.length === 0) {
          next.pop();
        }
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-128px)] flex-col sm:h-[calc(100dvh-72px)]">
      {/* ---- 消息列表 ---- */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && (
            <EmptyState />
          )}
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              ⚠ {error}
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
              send();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="今晚和女朋友吃啥？想要日料、200 块以内…"
              rows={1}
              disabled={sending}
              className="field-input flex-1 resize-none py-2.5 leading-relaxed"
              style={{ maxHeight: 120 }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="btn-primary shrink-0 px-4 py-2.5 text-sm"
            >
              {sending ? "..." : "发送"}
            </button>
          </form>
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Enter 发送，Shift+Enter 换行
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <p className="heading-display text-xl text-[var(--text-strong)]">
        和你的餐厅库聊聊
      </p>
      <p className="mt-2 max-w-sm text-sm text-zinc-600">
        告诉我你想吃啥 / 跟谁 / 预算多少，我从你的 list 里挑 2-3 家并给出理由。
      </p>
      <ul className="mt-5 space-y-1.5 text-sm text-zinc-500">
        <li>「今晚一个人，吃面」</li>
        <li>「明天约会，日料，200 内」</li>
        <li>「那家鼎泰丰怎么样？」</li>
      </ul>
    </div>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
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
        {message.content.map((block, i) => (
          <ContentBlockView key={i} block={block} />
        ))}
        {message.streaming && message.content.length > 0 && (
          <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-current align-baseline opacity-50" />
        )}
      </div>
    </div>
  );
}

function ContentBlockView({ block }: { block: LlmContentBlock }) {
  if (block.type === "text") {
    return <span className="whitespace-pre-wrap">{block.text}</span>;
  }
  if (block.type === "tool_use") {
    return (
      <div className="my-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-2.5 py-1.5 text-xs text-zinc-600">
        <span className="font-mono text-[var(--primary)]">⚙ {block.name}</span>
        {block.input != null &&
          typeof block.input === "object" &&
          Object.keys(block.input).length > 0 && (
            <span className="ml-2 opacity-70">
              {JSON.stringify(block.input).slice(0, 80)}
            </span>
          )}
      </div>
    );
  }
  if (block.type === "tool_result") {
    // 默认折叠
    return null;
  }
  return null;
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
