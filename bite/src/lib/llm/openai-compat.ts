import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodTypeAny, z } from "zod";
import {
  LlmProviderError,
  type ExtractParams,
  type LlmProvider,
  type ResolvedProviderConfig,
  type StreamChatParams,
  type StreamChunk,
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async *streamChat(_params: StreamChatParams): AsyncIterable<StreamChunk> {
    // Day 8 实现
    throw new LlmProviderError(
      "api",
      "streamChat 尚未实现（Phase 3 Day 8）",
    );
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
