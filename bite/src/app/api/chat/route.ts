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
- 用户库里没有合适的，可以建议外部的，但**不要偷偷写库**——明确问"要加进哪个 list 吗？"再调 add_to_list。
- 全程中文回复，简洁口语化，不要长篇大论。

【何时调工具】
- 模糊请求（"今晚吃啥"）：先 search_my_list（按 status=want_to_go），再选。
- 限定请求（"约会、吃日料、200 块以内"）：search_my_list 带 cuisine + price_range。
- 用户问"那家 XX 怎么样"：check_place_details 看 notes / reasons。
- 工具失败了如实告知用户，不要编造。`;

type RequestBody = {
  conversation_id?: string;
  message: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const userText = (body.message ?? "").trim();
  if (!userText) {
    return new Response("Empty message", { status: 400 });
  }
  if (userText.length > 4000) {
    return new Response("Message too long", { status: 400 });
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
  const historyRows = isNew ? [] : await loadMessages(supabase, conversationId);
  const messages: LlmMessage[] = historyRows.map((row) => ({
    role: row.role,
    content: row.content,
  }));

  // 4. 追加用户新消息（先写库，再喂模型）
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

  // 5. SSE stream
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
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
          loops++;

          const assistantBlocks: LlmContentBlock[] = [];
          let currentText = "";
          // tool_use 累积：id → { name, inputJsonAccum }
          const pendingToolUses = new Map<
            string,
            { name: string; inputJson: string }
          >();
          let stopReason: string = "end_turn";

          for await (const chunk of provider.streamChat({
            system: SYSTEM_PROMPT,
            messages,
            tools: CHAT_TOOLS,
            maxTokens: 4096,
          })) {
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
            } else if (chunk.type === "stop") {
              stopReason = chunk.reason;
            }
          }
          if (currentText) {
            assistantBlocks.push({ type: "text", text: currentText });
          }

          // 写 assistant 这一轮
          await appendMessage(supabase, {
            conversationId,
            role: "assistant",
            content: assistantBlocks,
            stopReason,
          });
          messages.push({ role: "assistant", content: assistantBlocks });

          // 如果停在 tool_use，执行工具并喂回 user-role tool_result
          if (stopReason === "tool_use") {
            const toolUses = assistantBlocks.filter(
              (b): b is Extract<LlmContentBlock, { type: "tool_use" }> =>
                b.type === "tool_use",
            );

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
