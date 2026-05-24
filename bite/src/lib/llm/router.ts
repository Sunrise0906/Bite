// 根据当前用户的 settings 选 provider，返回 LlmProvider 实例。
// 用户没在 Settings 配 → 走默认（anthropic + app 默认 key）

import { createClient, getUser } from "@/lib/supabase/server";
import { AnthropicProvider } from "./anthropic";
import { OpenAiCompatProvider } from "./openai-compat";
import {
  LlmProviderError,
  PROVIDER_PRESETS,
  type LlmProvider,
  type ProviderId,
  type ResolvedProviderConfig,
} from "./types";

export type UserLlmSettings = {
  provider: ProviderId;
  api_key: string | null;
  base_url: string | null;
  chat_model: string | null;
  extract_model: string | null;
};

const DEFAULT_PROVIDER: ProviderId = "anthropic";

export async function loadUserLlmSettings(): Promise<UserLlmSettings | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_llm_settings")
    .select("provider, api_key, base_url, chat_model, extract_model")
    .eq("user_id", user.id)
    .maybeSingle<UserLlmSettings>();
  return data ?? null;
}

export function resolveConfig(
  settings: UserLlmSettings | null,
): ResolvedProviderConfig {
  const providerId: ProviderId = settings?.provider ?? DEFAULT_PROVIDER;
  const preset = PROVIDER_PRESETS[providerId];

  const userKey = settings?.api_key?.trim() || null;
  const appKey = process.env[preset.apiKeyEnvVar];
  const apiKey = userKey ?? appKey ?? "";

  if (!apiKey) {
    throw new LlmProviderError(
      "missing_key",
      `${providerId} 没配置 API key（用户未填，env var ${preset.apiKeyEnvVar} 也是空的）。请去 /profile 设置或检查 .env.local。`,
    );
  }

  return {
    id: providerId,
    apiKey,
    baseUrl: settings?.base_url?.trim() || preset.baseUrl,
    extractModel:
      settings?.extract_model?.trim() || preset.defaultExtractModel,
    chatModel: settings?.chat_model?.trim() || preset.defaultChatModel,
    keySource: userKey ? "user" : "app_default",
  };
}

export function buildProvider(config: ResolvedProviderConfig): LlmProvider {
  switch (config.id) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
    case "deepseek":
    case "qwen":
      return new OpenAiCompatProvider(config);
  }
}

/** 一步到位：根据当前用户的 settings 返回可用 provider */
export async function getProvider(): Promise<LlmProvider> {
  const settings = await loadUserLlmSettings();
  const config = resolveConfig(settings);
  return buildProvider(config);
}
