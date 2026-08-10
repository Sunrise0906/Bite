// 根据当前用户的 settings 选 provider，返回 LlmProvider 实例。
// 用户没在 Settings 配 → 走默认（anthropic + app 默认 key）

import { createClient, getUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { AnthropicProvider } from "./anthropic";
import { OpenAiCompatProvider } from "./openai-compat";
import {
  LlmProviderError,
  PROVIDER_PRESETS,
  type LlmProvider,
  type ProviderId,
  type ResolvedProviderConfig,
} from "./types";
import { providerChain } from "./failover";

export type UserLlmSettings = {
  provider: ProviderId;
  api_key: string | null;
  base_url: string | null;
  chat_model: string | null;
  extract_model: string | null;
};

// 默认走 Gemini —— 真·免费（Google AI Studio key），新用户开箱即用
const DEFAULT_PROVIDER: ProviderId = "gemini";

export async function loadUserLlmSettings(): Promise<UserLlmSettings | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_llm_settings")
    .select("provider, api_key, base_url, chat_model, extract_model")
    .eq("user_id", user.id)
    .maybeSingle<UserLlmSettings>();
  if (!data) return null;
  // 落库的 api_key 可能是密文（见 secret-box）；解密回明文供 provider 使用。
  // 解不开（secret 缺失/错配）→ null，resolveConfig 会退回 app 默认 key。
  if (data.api_key) {
    data.api_key = decryptSecret(data.api_key);
  }
  return data;
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
    case "gemini":
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

/** 某个 provider 有没有配 app 默认 key */
export function hasAppKey(id: ProviderId): boolean {
  return Boolean(process.env[PROVIDER_PRESETS[id].apiKeyEnvVar]?.trim());
}

/**
 * 故障转移用的 provider 列表：用户选的排第一，后面跟上其他**配了 app key** 的。
 *
 * 用户自己填了 key 时只返回他选的那一个 —— 他明确指定了要用谁（而且可能是付费
 * 额度），不该在他背后偷偷换别家。只有走 app 默认 key 时才做转移。
 */
export async function resolveProviderChain(): Promise<ResolvedProviderConfig[]> {
  const settings = await loadUserLlmSettings();
  const primary = resolveConfig(settings);
  if (primary.keySource === "user") return [primary];

  const ids = providerChain(primary.id, hasAppKey);
  const configs: ResolvedProviderConfig[] = [];
  for (const id of ids) {
    try {
      // 只换 provider，保留用户的 base_url/model 覆盖是不对的（那是给原 provider 的）
      configs.push(
        resolveConfig(id === primary.id ? settings : { provider: id, api_key: null, base_url: null, chat_model: null, extract_model: null }),
      );
    } catch {
      // 这家没 key → 跳过（providerChain 已经过滤过，这里是兜底）
    }
  }
  return configs.length > 0 ? configs : [primary];
}
