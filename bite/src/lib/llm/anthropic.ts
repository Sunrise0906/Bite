import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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

export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;

  constructor(public readonly config: ResolvedProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async extract<T extends ZodTypeAny>(
    params: ExtractParams<T>,
  ): Promise<z.infer<T>> {
    try {
      const response = await this.client.messages.parse({
        model: this.config.extractModel,
        max_tokens: params.maxTokens ?? 4096,
        system: [
          {
            type: "text",
            text: params.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          ...(params.fewShots ?? []).flatMap((ex) => [
            { role: "user" as const, content: ex.user },
            {
              role: "assistant" as const,
              content: JSON.stringify(ex.assistant),
            },
          ]),
          { role: "user", content: params.userInput },
        ],
        output_config: {
          format: zodOutputFormat(params.schema),
        },
      });

      if (!response.parsed_output) {
        throw new LlmProviderError("parse", "AI 未返回有效结构化结果");
      }
      return response.parsed_output as z.infer<T>;
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }

  async *streamChat(params: StreamChatParams): AsyncIterable<StreamChunk> {
    const stream = this.client.messages.stream({
      model: this.config.chatModel,
      max_tokens: params.maxTokens ?? 4096,
      ...(params.system
        ? {
            system: [
              {
                type: "text" as const,
                text: params.system,
                cache_control: { type: "ephemeral" as const },
              },
            ],
          }
        : {}),
      messages: params.messages.map(toAnthropicMessage),
      ...(params.tools && params.tools.length > 0
        ? {
            tools: params.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema,
            })),
          }
        : {}),
    });

    // 跟踪当前正在累积的 tool_use 块（按 content block index）
    const toolUses = new Map<number, { id: string; name: string }>();
    let stopReason: StreamStopReason = "end_turn";

    try {
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "tool_use") {
            toolUses.set(event.index, { id: block.id, name: block.name });
            yield { type: "tool_use_start", id: block.id, name: block.name };
          }
          // text block start 不发；等 delta 来
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            yield { type: "text", delta: delta.text };
          } else if (delta.type === "input_json_delta") {
            const tu = toolUses.get(event.index);
            if (tu) {
              yield {
                type: "tool_use_input_delta",
                id: tu.id,
                delta: delta.partial_json,
              };
            }
          }
        } else if (event.type === "message_delta") {
          const reason = event.delta.stop_reason;
          if (reason) stopReason = mapAnthropicStopReason(reason);
        }
      }

      // 最终消息里取出每个 tool_use 的 parsed input（SDK 已经组装好了）
      const finalMessage = await stream.finalMessage();
      for (const block of finalMessage.content) {
        if (block.type === "tool_use") {
          yield {
            type: "tool_use_done",
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
      }

      // 用量：input/output tokens（cache tokens 暂不区分）
      if (finalMessage.usage) {
        yield {
          type: "usage",
          inputTokens:
            (finalMessage.usage.input_tokens ?? 0) +
            (finalMessage.usage.cache_read_input_tokens ?? 0) +
            (finalMessage.usage.cache_creation_input_tokens ?? 0),
          outputTokens: finalMessage.usage.output_tokens ?? 0,
        };
      }

      yield { type: "stop", reason: stopReason };
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }
}

function toAnthropicMessage(m: LlmMessage): Anthropic.MessageParam {
  if (typeof m.content === "string") {
    return { role: m.role, content: m.content };
  }
  return {
    role: m.role,
    content: m.content.map(toAnthropicBlock),
  };
}

function toAnthropicBlock(
  block: LlmContentBlock,
): Anthropic.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.tool_use_id,
        content: block.content,
        ...(block.is_error ? { is_error: true } : {}),
      };
  }
}

function mapAnthropicStopReason(
  reason: Anthropic.Messages.StopReason,
): StreamStopReason {
  switch (reason) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "end_turn";
  }
}

function mapAnthropicError(err: unknown): LlmProviderError {
  if (err instanceof LlmProviderError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new LlmProviderError(
      "auth",
      "Anthropic API key 无效，请检查 ANTHROPIC_API_KEY 或你在 Settings 填的 key",
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmProviderError("rate_limit", "Anthropic 限流，请稍后再试");
  }
  if (err instanceof Anthropic.APIError) {
    return new LlmProviderError("api", `Anthropic API 错误：${err.message}`);
  }
  if (err instanceof Error) {
    return new LlmProviderError("unknown", err.message);
  }
  return new LlmProviderError("unknown", String(err));
}
