// LLM provider 统一抽象。给 extract（结构化提取）和 chat（流式 + tool calling）
// 两类用法。Anthropic / OpenAI / DeepSeek / Qwen 都实现这个接口。

import type { ZodTypeAny, z } from "zod";

export type ProviderId = "anthropic" | "openai" | "deepseek" | "qwen";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic Claude",
  openai: "OpenAI GPT",
  deepseek: "DeepSeek",
  qwen: "通义千问 Qwen",
};

// 每个 provider 的默认模型 + base URL
export type ProviderPreset = {
  id: ProviderId;
  baseUrl: string;
  defaultExtractModel: string;
  defaultChatModel: string;
  apiKeyEnvVar: string; // App fallback env var name
};

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  anthropic: {
    id: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultExtractModel: "claude-haiku-4-5",
    defaultChatModel: "claude-sonnet-4-6",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
  },
  openai: {
    id: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultExtractModel: "gpt-5-mini",
    defaultChatModel: "gpt-5",
    apiKeyEnvVar: "OPENAI_API_KEY",
  },
  deepseek: {
    id: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultExtractModel: "deepseek-chat",
    defaultChatModel: "deepseek-chat",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
  },
  qwen: {
    id: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultExtractModel: "qwen-turbo",
    defaultChatModel: "qwen-plus",
    apiKeyEnvVar: "DASHSCOPE_API_KEY",
  },
};

// 解析好的 provider 配置（已知 key + URL + model）
export type ResolvedProviderConfig = {
  id: ProviderId;
  apiKey: string;
  baseUrl: string;
  extractModel: string;
  chatModel: string;
  // key 来源：用户自带 / app 默认。用于错误提示
  keySource: "user" | "app_default";
};

// ============================ Extract（结构化提取）============================

export type FewShot<T> = { user: string; assistant: T };

export type ExtractParams<T extends ZodTypeAny> = {
  system: string;
  fewShots?: Array<FewShot<z.infer<T>>>;
  userInput: string;
  schema: T;
  schemaName?: string;
  maxTokens?: number;
};

// ============================ Stream Chat ============================
// Day 8 才用，先放占位类型

export type LlmTextMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LlmTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type StreamChunk =
  | { type: "text"; delta: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_use_input_delta"; delta: string }
  | { type: "tool_use_done"; id: string; name: string; input: unknown }
  | {
      type: "stop";
      reason: "end_turn" | "tool_use" | "max_tokens" | "refusal" | "error";
    };

export type StreamChatParams = {
  system?: string;
  messages: LlmTextMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
};

// ============================ Provider 接口 ============================

export type LlmError =
  | { type: "missing_key"; message: string }
  | { type: "rate_limit"; message: string }
  | { type: "auth"; message: string }
  | { type: "api"; message: string }
  | { type: "parse"; message: string }
  | { type: "unknown"; message: string };

export class LlmProviderError extends Error {
  constructor(
    public readonly kind: LlmError["type"],
    message: string,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export interface LlmProvider {
  readonly config: ResolvedProviderConfig;
  extract<T extends ZodTypeAny>(params: ExtractParams<T>): Promise<z.infer<T>>;
  streamChat(params: StreamChatParams): AsyncIterable<StreamChunk>;
}
