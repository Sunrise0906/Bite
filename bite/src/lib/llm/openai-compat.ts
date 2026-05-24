import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodTypeAny, z } from "zod";
import {
  LlmProviderError,
  type ExtractParams,
  type LlmContentBlock,
  type LlmMessage,
  type LlmProvider,
  type ResolvedProviderConfig,
  type StreamChatParams,
  type StreamChunk,
  type StreamStopReason,
} from "./types";

// OpenAI / DeepSeek / Qwen 都用同一份实现，只是 baseUrl + model 不同。
// 三家都兼容 OpenAI Chat Completions API。
//   - OpenAI 支持 strict json_schema response_format
//   - DeepSeek 支持 response_format: { type: 'json_object' }
//   - Qwen (DashScope 兼容模式) 同 DeepSeek
// 我们统一用 json_object，输出后用 Zod 校验，三家通吃。

export class OpenAiCompatProvider implements LlmProvider {
  private client: OpenAI;

  constructor(public readonly config: ResolvedProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async extract<T extends ZodTypeAny>(
    params: ExtractParams<T>,
  ): Promise<z.infer<T>> {
    // 用 Zod 派生 schema 给模型看，提高首次成功率
    const schemaPreview = describeZodSchema(params.schema);

    const userPrompt =
      params.userInput +
      `\n\n（仅返回符合此 JSON schema 的 JSON 对象，不要 markdown 包裹、不要解释）\n` +
      schemaPreview;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: params.system },
      ...(params.fewShots ?? []).flatMap(
        (ex): OpenAI.ChatCompletionMessageParam[] => [
          { role: "user", content: ex.user },
          { role: "assistant", content: JSON.stringify(ex.assistant) },
        ],
      ),
      { role: "user", content: userPrompt },
    ];

    // OpenAI 原生：用 strict json_schema 最稳；其他兼容 endpoint 用 json_object
    const isOpenAi = this.config.id === "openai";

    try {
      let rawJson: string;

      if (isOpenAi) {
        const response = await this.client.chat.completions.parse({
          model: this.config.extractModel,
          max_tokens: params.maxTokens ?? 4096,
          messages,
          response_format: zodResponseFormat(
            params.schema,
            params.schemaName ?? "extraction",
          ),
        });
        const parsed = response.choices[0]?.message.parsed;
        if (parsed === undefined || parsed === null) {
          throw new LlmProviderError("parse", "OpenAI 未返回 parsed 结果");
        }
        return parsed as z.infer<T>;
      } else {
        const response = await this.client.chat.completions.create({
          model: this.config.extractModel,
          max_tokens: params.maxTokens ?? 4096,
          messages,
          response_format: { type: "json_object" },
        });
        rawJson = response.choices[0]?.message.content ?? "";
        if (!rawJson) {
          throw new LlmProviderError("parse", "模型未返回内容");
        }
      }

      // json_object 路径：手动 parse + Zod 校验
      let obj: unknown;
      try {
        obj = JSON.parse(rawJson);
      } catch (e) {
        throw new LlmProviderError(
          "parse",
          `模型返回的不是合法 JSON：${(e as Error).message}`,
        );
      }
      const result = params.schema.safeParse(obj);
      if (!result.success) {
        throw new LlmProviderError(
          "parse",
          `JSON 不符合 schema：${result.error.message.slice(0, 200)}`,
        );
      }
      return result.data;
    } catch (err) {
      throw mapOpenAiError(err);
    }
  }

  async *streamChat(params: StreamChatParams): AsyncIterable<StreamChunk> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (params.system) {
      messages.push({ role: "system", content: params.system });
    }
    for (const m of params.messages) {
      messages.push(...toOpenAiMessages(m));
    }

    const tools: OpenAI.ChatCompletionTool[] | undefined =
      params.tools && params.tools.length > 0
        ? params.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            },
          }))
        : undefined;

    let stream: AsyncIterable<OpenAI.ChatCompletionChunk>;
    try {
      stream = await this.client.chat.completions.create({
        model: this.config.chatModel,
        max_tokens: params.maxTokens ?? 4096,
        messages,
        ...(tools ? { tools } : {}),
        stream: true,
        // 让最后一片带 usage（OpenAI / Gemini OpenAI-compat 都支持，DeepSeek/Qwen 通常也兼容）
        stream_options: { include_usage: true },
      });
    } catch (err) {
      throw mapOpenAiError(err);
    }

    // OpenAI 把 tool_call 拆成多个 delta：第一片有 id/name，后续片只是 arguments 拼接
    // 用 index 追踪每个 tool_call
    const toolCalls = new Map<
      number,
      { id: string; name: string; args: string; emittedStart: boolean }
    >();
    let finishReason: StreamStopReason = "end_turn";
    let capturedUsage: { prompt_tokens?: number; completion_tokens?: number } | null = null;

    try {
      for await (const chunk of stream) {
        // include_usage 的最后一片 choices 是空的，usage 在 chunk.usage
        if (chunk.usage) {
          capturedUsage = {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
          };
        }
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (delta?.content) {
          yield { type: "text", delta: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            let entry = toolCalls.get(idx);
            if (!entry) {
              entry = {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                args: "",
                emittedStart: false,
              };
              toolCalls.set(idx, entry);
            } else {
              // 后续片段可能补 id / name（OpenAI 通常第一片就全了）
              if (tc.id && !entry.id) entry.id = tc.id;
              if (tc.function?.name && !entry.name) entry.name = tc.function.name;
            }

            // id + name 齐了就发 start
            if (!entry.emittedStart && entry.id && entry.name) {
              entry.emittedStart = true;
              yield { type: "tool_use_start", id: entry.id, name: entry.name };
            }

            const argDelta = tc.function?.arguments;
            if (argDelta) {
              entry.args += argDelta;
              if (entry.emittedStart) {
                yield {
                  type: "tool_use_input_delta",
                  id: entry.id,
                  delta: argDelta,
                };
              }
            }
          }
        }

        if (choice.finish_reason) {
          finishReason = mapOpenAiFinishReason(choice.finish_reason);
        }
      }

      // 收尾：每个 tool_call 解析 args JSON 后发 done
      for (const entry of toolCalls.values()) {
        if (!entry.emittedStart) continue;
        let input: unknown = {};
        try {
          input = entry.args ? JSON.parse(entry.args) : {};
        } catch {
          // 模型偶尔返回不合法 JSON。包成错误传给上层
          input = { __invalid_json__: entry.args };
        }
        yield {
          type: "tool_use_done",
          id: entry.id,
          name: entry.name,
          input,
        };
      }

      if (capturedUsage) {
        yield {
          type: "usage",
          inputTokens: capturedUsage.prompt_tokens ?? 0,
          outputTokens: capturedUsage.completion_tokens ?? 0,
        };
      }

      yield { type: "stop", reason: finishReason };
    } catch (err) {
      throw mapOpenAiError(err);
    }
  }
}

function toOpenAiMessages(
  m: LlmMessage,
): OpenAI.ChatCompletionMessageParam[] {
  if (typeof m.content === "string") {
    if (m.role === "user") {
      return [{ role: "user", content: m.content }];
    }
    return [{ role: "assistant", content: m.content }];
  }

  if (m.role === "assistant") {
    const textParts: string[] = [];
    const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
    for (const block of m.content as LlmContentBlock[]) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
      }
    }
    const msg: OpenAI.ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: textParts.length > 0 ? textParts.join("\n") : null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };
    return [msg];
  }

  // user role with content blocks：可能含 text + tool_result
  // OpenAI 把 tool_result 单独表达为 role:"tool" 消息
  const out: OpenAI.ChatCompletionMessageParam[] = [];
  const textParts: string[] = [];
  for (const block of m.content as LlmContentBlock[]) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_result") {
      out.push({
        role: "tool",
        tool_call_id: block.tool_use_id,
        content: block.content,
      });
    }
  }
  if (textParts.length > 0) {
    out.push({ role: "user", content: textParts.join("\n") });
  }
  return out;
}

function mapOpenAiFinishReason(
  reason: OpenAI.ChatCompletionChunk.Choice["finish_reason"],
): StreamStopReason {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "end_turn";
  }
}

function mapOpenAiError(err: unknown): LlmProviderError {
  if (err instanceof LlmProviderError) return err;
  if (err instanceof OpenAI.AuthenticationError) {
    return new LlmProviderError(
      "auth",
      "API key 无效，请在 Settings 检查",
    );
  }
  if (err instanceof OpenAI.RateLimitError) {
    return new LlmProviderError("rate_limit", "限流，请稍后再试");
  }
  if (err instanceof OpenAI.APIError) {
    return new LlmProviderError("api", `API 错误：${err.message}`);
  }
  if (err instanceof Error) {
    return new LlmProviderError("unknown", err.message);
  }
  return new LlmProviderError("unknown", String(err));
}

// 把 Zod schema 描述成给模型读的字段说明，提示 json 应该长什么样
function describeZodSchema(schema: ZodTypeAny): string {
  try {
    // 这是个 best-effort 描述，重点是给非 OpenAI 的 endpoint 一个 schema hint
    // 不需要完全准确，模型理解大意即可
    const desc = schema.description;
    if (desc) return desc;
    return "（结构按 system prompt 中规定）";
  } catch {
    return "";
  }
}
