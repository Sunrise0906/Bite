// /api/chat — SSE 流式决策聊天。
// 负责：
//   1. 鉴权 + 加载 / 新建 conversation
//   2. 拼接历史 + 用户新消息 + 系统 prompt + tools，喂给 provider.streamChat
//   3. 把 stream events 转 SSE 转发给浏览器
//   4. 遇到 tool_use 自动执行 tool + 把 tool_result 喂回模型，继续下一轮
//   5. 每轮结束把 assistant 消息写库

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/llm/router";
import { LlmProviderError } from "@/lib/llm/types";
import type { LlmContentBlock, LlmMessage } from "@/lib/llm/types";
import { CHAT_TOOLS, executeChatTool } from "@/lib/llm/chat-tools";
import { trimHistory, sanitizeTailOrphan } from "@/lib/llm/trim-history";
import { checkChatRateLimit } from "@/lib/ratelimit/chat-limit";
import {
  appendMessage,
  createConversation,
  getConversation,
  loadMessages,
  updateConversationTitle,
} from "@/lib/db/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `你是 Bite 的决策助手——帮用户从他们自己记录的餐厅库里挑"去哪吃"。

【行为准则】
- 优先用工具查用户的库。在推荐前先 search_my_list；候选不够再深挖 check_place_details。
- 推荐时给出 2-3 家具体店，每家附上"为什么选它"（引用用户自己写的 reason / notes / tags）。
- **提到用户库里已有的店名时一律用书名号包起来**：«鼎泰丰»、«海底捞»。前端会把它渲染成可点击跳转的链接。外部店名（不在库里）不要加书名号。
- 用户库里没有合适的，可以建议外部的，但**不要偷偷写库**——明确问"要加进哪个 list 吗？"再调 add_to_list。
- 全程中文回复，简洁口语化，不要长篇大论。

【何时调工具】
- 模糊请求（"今晚吃啥"）：先 search_my_list（按 status=want_to_go 或 visited），再选。
- 限定请求（"约会、吃日料、200 块以内"）：search_my_list 带 cuisine + price_range。
- 用户问"那家 XX 怎么样"：check_place_details 看 notes / reasons / 最近 visit logs。
- 工具失败了如实告知用户，不要编造。

【冷启动 / 空库的情况】
- search_my_list 返回 note="用户还没有任何 list"：友好提示 ta「先去 /lists 建一个，然后用 /quick-add 加店或粘小红书链接，AI 抽取完我就能帮你挑了」。
- search_my_list 返回 count=0（有 list 但没匹配店）：告诉用户库里没匹配的，要不要换条件或加几家试试。可以推荐外部店给参考但**不主动写库**。

【利用造访信号】
- search_my_list 每家店带 visit_count、last_visit、last_sentiment。
- last_sentiment=will_return 是强信号（用户去过且还想再来）——优先推。
- last_sentiment=wont_return 是负信号——除非用户明确要再试一次否则别推。
- visit_count=0 表示还没去过（status=want_to_go 的纯期待）——可以推但建议明确告知"你还没去过"。
- 推荐文案里可以引用："你 8 月去过觉得不错"、"上次和女朋友 4 星"。`;

type RequestBody = {
  conversation_id?: string;
  message?: string;
  /** true 时不追加新 user 消息，而是删除最后一轮 assistant + tool_result，从已存在的 last user 消息重新生成 */
  regenerate?: boolean;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 限流：保护开发者出资的默认 LLM key 不被刷爆（每分钟 / 每小时上限）
  const rl = checkChatRateLimit(user.id);
  if (!rl.ok) {
    return new Response(rl.message, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const isRegen = body.regenerate === true;
  const userText = (body.message ?? "").trim();
  if (!isRegen) {
    if (!userText) return new Response("Empty message", { status: 400 });
    if (userText.length > 4000) {
      return new Response("Message too long", { status: 400 });
    }
  }
  if (isRegen && !body.conversation_id) {
    return new Response("regenerate 需要 conversation_id", { status: 400 });
  }

  // 1. provider
  let provider;
  try {
    provider = await getProvider();
  } catch (err) {
    if (err instanceof LlmProviderError) {
      return new Response(err.message, { status: 400 });
    }
    return new Response("Provider 初始化失败", { status: 500 });
  }

  // 2. conversation
  let conversationId = body.conversation_id;
  let isNew = false;
  if (conversationId) {
    const convo = await getConversation(supabase, conversationId, user.id);
    if (!convo) return new Response("Conversation not found", { status: 404 });
  } else {
    const result = await createConversation(supabase, {
      userId: user.id,
      provider: provider.config.id,
      model: provider.config.chatModel,
    });
    if ("error" in result) {
      return new Response(`创建会话失败：${result.error}`, { status: 500 });
    }
    conversationId = result.id;
    isNew = true;
  }

  // 3. 拼历史
  let historyRows = isNew ? [] : await loadMessages(supabase, conversationId);

  if (isRegen) {
    // 找到最后一条"含 text 的 user 消息"作为重新生成的起点
    let cutIdx = -1;
    for (let i = historyRows.length - 1; i >= 0; i--) {
      const row = historyRows[i];
      if (row.role !== "user") continue;
      const hasText = row.content.some(
        (b) =>
          b.type === "text" && typeof b.text === "string" && b.text.trim() !== "",
      );
      if (hasText) {
        cutIdx = i;
        break;
      }
    }
    if (cutIdx === -1) {
      return new Response("找不到可重新生成的用户消息", { status: 400 });
    }
    // 删掉这条 user-text 之后的所有 message（assistant + tool_result 跟进的 user）
    const toDelete = historyRows.slice(cutIdx + 1).map((r) => r.id);
    if (toDelete.length > 0) {
      await supabase.from("messages").delete().in("id", toDelete);
    }
    historyRows = historyRows.slice(0, cutIdx + 1);
  }

  // 长会话保护：超过 30 条只保留最近 24 条 + 一条 system-style 摘要，防 token 失控
  // （尤其 tool_result 占空间）。从消息边界裁剪、不切散 tool_use/tool_result 配对，
  // 逻辑+测试见 trimHistory。
  const trimmed = trimHistory(historyRows, { maxTurns: 30, keepTurns: 24 });
  historyRows = trimmed.rows;
  const truncated = trimmed.truncated;

  // 上一轮可能在 assistant(tool_use) 之后崩了，留下没配对的 tool_use。
  // 如果直接发给 provider 会被拒（Anthropic 400），永久 brick 这个会话。
  historyRows = sanitizeTailOrphan(historyRows);

  const messages: LlmMessage[] = historyRows.map((row) => ({
    role: row.role,
    content: row.content,
  }));

  // 截断了：在最前面插一条 system-style 摘要给 LLM 看
  if (truncated && messages.length > 0) {
    messages.unshift({
      role: "user",
      content: [
        {
          type: "text",
          text:
            "（此对话历史较长，更早的轮次已被省略以控制成本。后续根据当前用户问题 + 可见上下文回答即可。）",
        },
      ],
    });
  }

  // 4. 非 regen：追加用户新消息（先写库，再喂模型）
  if (!isRegen) {
    const userBlock: LlmContentBlock[] = [{ type: "text", text: userText }];
    const userInsert = await appendMessage(supabase, {
      conversationId,
      role: "user",
      content: userBlock,
    });
    if ("error" in userInsert) {
      return new Response(`保存消息失败：${userInsert.error}`, { status: 500 });
    }
    messages.push({ role: "user", content: userBlock });
  }

  // 5. SSE stream
  const encoder = new TextEncoder();
  // 客户端断开就停掉这次 LLM 调用，省 token / 防止偷偷继续执行工具
  const clientSignal = req.signal;
  const send = (controller: ReadableStreamDefaultController, obj: unknown) => {
    if (clientSignal.aborted) return;
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
    } catch {
      // controller 已经关了
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 首条发 meta：让前端知道 convo id
        send(controller, {
          type: "meta",
          conversation_id: conversationId,
          is_new: isNew,
        });

        const MAX_TOOL_LOOPS = 6;
        let loops = 0;

        while (loops < MAX_TOOL_LOOPS) {
          if (clientSignal.aborted) break;
          loops++;

          const assistantBlocks: LlmContentBlock[] = [];
          let currentText = "";
          // tool_use 累积：id → { name, inputJsonAccum }
          const pendingToolUses = new Map<
            string,
            { name: string; inputJson: string }
          >();
          let stopReason: string = "end_turn";
          let turnUsage: { input_tokens: number; output_tokens: number } | null = null;

          for await (const chunk of provider.streamChat({
            system: SYSTEM_PROMPT,
            messages,
            tools: CHAT_TOOLS,
            maxTokens: 4096,
          })) {
            if (clientSignal.aborted) break;
            if (chunk.type === "text") {
              currentText += chunk.delta;
              send(controller, { type: "text", delta: chunk.delta });
            } else if (chunk.type === "tool_use_start") {
              // 把之前累的 text 落盘成一个 block
              if (currentText) {
                assistantBlocks.push({ type: "text", text: currentText });
                currentText = "";
              }
              pendingToolUses.set(chunk.id, {
                name: chunk.name,
                inputJson: "",
              });
              send(controller, {
                type: "tool_use_start",
                id: chunk.id,
                name: chunk.name,
              });
            } else if (chunk.type === "tool_use_input_delta") {
              const tu = pendingToolUses.get(chunk.id);
              if (tu) tu.inputJson += chunk.delta;
              send(controller, {
                type: "tool_use_input_delta",
                id: chunk.id,
                delta: chunk.delta,
              });
            } else if (chunk.type === "tool_use_done") {
              pendingToolUses.delete(chunk.id);
              assistantBlocks.push({
                type: "tool_use",
                id: chunk.id,
                name: chunk.name,
                input: chunk.input,
              });
              send(controller, {
                type: "tool_use_done",
                id: chunk.id,
                name: chunk.name,
                input: chunk.input,
              });
            } else if (chunk.type === "usage") {
              turnUsage = {
                input_tokens: chunk.inputTokens,
                output_tokens: chunk.outputTokens,
              };
              send(controller, {
                type: "usage",
                input_tokens: chunk.inputTokens,
                output_tokens: chunk.outputTokens,
              });
            } else if (chunk.type === "stop") {
              stopReason = chunk.reason;
            }
          }
          if (currentText) {
            assistantBlocks.push({ type: "text", text: currentText });
          }

          // 客户端断开：把已经收到的部分落库（不浪费这轮 token），停循环
          if (clientSignal.aborted) {
            if (assistantBlocks.length > 0) {
              await appendMessage(supabase, {
                conversationId,
                role: "assistant",
                content: assistantBlocks,
                usage: turnUsage,
                stopReason: "aborted",
              });
            }
            break;
          }

          // 写 assistant 这一轮
          await appendMessage(supabase, {
            conversationId,
            role: "assistant",
            content: assistantBlocks,
            usage: turnUsage,
            stopReason,
          });
          messages.push({ role: "assistant", content: assistantBlocks });

          // 如果停在 tool_use，执行工具并喂回 user-role tool_result
          if (stopReason === "tool_use") {
            const toolUses = assistantBlocks.filter(
              (b): b is Extract<LlmContentBlock, { type: "tool_use" }> =>
                b.type === "tool_use",
            );

            // 防御：provider 报告 stop=tool_use 但没有任何完整的 tool_use 块
            // （例如 OpenAI-compat 流里 tool_call 缺 id/name 被丢弃）。
            // 不能继续循环——下一轮会喂一条空 user 消息给 LLM，要么被静默丢弃要么 API 报错。
            // 当作 end_turn 处理，把已经产生的文本（如果有）发给用户。
            if (toolUses.length === 0) {
              send(controller, { type: "done", reason: "end_turn" });
              break;
            }

            const resultBlocks: LlmContentBlock[] = [];
            for (const tu of toolUses) {
              send(controller, {
                type: "tool_executing",
                id: tu.id,
                name: tu.name,
              });
              const result = await executeChatTool(tu.name, tu.input, {
                userId: user.id,
                supabase,
              });
              resultBlocks.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: result,
              });
              send(controller, {
                type: "tool_result",
                id: tu.id,
                name: tu.name,
                result,
              });
            }

            await appendMessage(supabase, {
              conversationId,
              role: "user",
              content: resultBlocks,
            });
            messages.push({ role: "user", content: resultBlocks });

            continue; // 下一轮
          }

          // 自然停止（end_turn / refusal / max_tokens / error）
          send(controller, { type: "done", reason: stopReason });
          break;
        }

        if (loops >= MAX_TOOL_LOOPS) {
          send(controller, {
            type: "done",
            reason: "max_tool_loops",
          });
        }

        // 新会话的第一轮，把用户第一条消息前 30 字当 title
        if (isNew) {
          const title =
            userText.length > 30 ? userText.slice(0, 30) + "…" : userText;
          await updateConversationTitle(supabase, conversationId, title);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "AI 调用失败";
        send(controller, { type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
