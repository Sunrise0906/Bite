import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodTypeAny, z } from "zod";
import {
  LlmProviderError,
  type ExtractParams,
  type LlmProvider,
  type ResolvedProviderConfig,
  type StreamChatParams,
  type StreamChunk,
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async *streamChat(_params: StreamChatParams): AsyncIterable<StreamChunk> {
    // Day 8 实现
    throw new LlmProviderError("api", "streamChat 尚未实现（Phase 3 Day 8）");
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
