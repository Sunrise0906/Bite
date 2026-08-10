"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { buildProvider, resolveConfig } from "@/lib/llm/router";
import { LlmProviderError, type ProviderId } from "@/lib/llm/types";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";

/** 已存的设置行（provider + 解密后的 key）。**只在服务端用**，绝不回传客户端。 */
async function loadStored(
  userId: string,
): Promise<{ provider: string; apiKey: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_llm_settings")
    .select("provider, api_key")
    .eq("user_id", userId)
    .maybeSingle<{ provider: string; api_key: string | null }>();
  if (!data) return null;
  return {
    provider: data.provider,
    apiKey: data.api_key ? decryptSecret(data.api_key) : null,
  };
}

/**
 * 已存的 key **仅在 provider 相同时**才可复用。
 *
 * ⚠️ key 是跟 provider 绑定的：把 Anthropic 的 sk-ant-… 拿去打 Gemini 只会 401。
 * 所以「表单留空 = 不改动」这条语义只在没换 provider 时成立；一旦换了 provider，
 * 留空必须理解成「这个新 provider 我没有自带 key，走 app 默认」。
 */
async function reusableKeyFor(
  userId: string,
  provider: ProviderId,
): Promise<string | null> {
  const stored = await loadStored(userId);
  if (!stored || stored.provider !== provider) return null;
  return stored.apiKey;
}

export type LlmSettingsFormState = {
  error: string | null;
  ok?: boolean;
  /** 每次成功保存都自增，让前端 useEffect 检测"新一次保存"做清理 */
  version?: number;
};

const VALID_PROVIDERS: ProviderId[] = [
  "gemini",
  "anthropic",
  "openai",
  "deepseek",
  "qwen",
];

function normalize(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

// ---- 保存 settings -------------------------------------------------------
export async function saveLlmSettings(
  prev: LlmSettingsFormState,
  formData: FormData,
): Promise<LlmSettingsFormState> {
  const user = await requireUser();

  const providerRaw = String(formData.get("provider") ?? "");
  if (!VALID_PROVIDERS.includes(providerRaw as ProviderId)) {
    return { error: "未知 provider" };
  }
  const provider = providerRaw as ProviderId;

  const apiKey = normalize(formData.get("api_key"));
  const baseUrl = normalize(formData.get("base_url"));
  const chatModel = normalize(formData.get("chat_model"));
  const extractModel = normalize(formData.get("extract_model"));

  // base_url 简单校验
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    return { error: "base_url 必须以 http(s):// 开头" };
  }

  // key 没贴满长度的话，给个温柔的提醒，但不阻止
  if (apiKey && apiKey.length < 10) {
    return { error: "API key 看起来太短了，确认一下？" };
  }

  // api_key 四态（表单不再回传已存的明文 key，所以「留空」不能一概当成「清空」）：
  //   1. clear_api_key=1        → 显式清空，回退到 app 默认 key
  //   2. 填了新值                → 覆盖
  //   3. 留空 + 换了 provider    → **清空**。key 跟 provider 绑定，继承旧厂商的 key
  //                                只会让新 provider 全线 401，而且表单这时显示的
  //                                恰恰是「留空走 app 默认 key」，必须与之一致。
  //   4. 留空 + 没换 provider    → 不动这一列（省略即可，upsert 的 UPDATE 不会碰它）
  const clearKey = String(formData.get("clear_api_key") ?? "") === "1";
  const stored = await loadStored(user.id);
  const providerChanged = Boolean(stored) && stored!.provider !== provider;

  const apiKeyPatch =
    clearKey || (!apiKey && providerChanged)
      ? { api_key: null }
      : apiKey
        ? // 落库前加密（BITE_SETTINGS_SECRET 未配置时 encryptSecret 原样返回明文）
          { api_key: encryptSecret(apiKey) }
        : {};

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_llm_settings")
    .upsert(
      {
        user_id: user.id,
        provider,
        ...apiKeyPatch,
        base_url: baseUrl,
        chat_model: chatModel,
        extract_model: extractModel,
      },
      { onConflict: "user_id" },
    );

  if (error) return { error: `保存失败：${error.message}` };

  revalidatePath("/profile");
  return { error: null, ok: true, version: (prev.version ?? 0) + 1 };
}

// ---- 清空（回退到 app 默认）---------------------------------------------
export async function clearLlmSettings(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("user_llm_settings").delete().eq("user_id", user.id);
  revalidatePath("/profile");
}

// ---- 测试连接（不保存）-------------------------------------------------
// 用表单当前值实测 provider，让用户在保存前就能验出错配
export type TestConnectionResult = { ok: true } | { error: string };

export async function testLlmConnection(
  formData: FormData,
): Promise<TestConnectionResult> {
  const user = await requireUser();

  const providerRaw = String(formData.get("provider") ?? "");
  const validProviders: ProviderId[] = [
    "gemini",
    "anthropic",
    "openai",
    "deepseek",
    "qwen",
  ];
  if (!validProviders.includes(providerRaw as ProviderId)) {
    return { error: "未知 provider" };
  }
  const provider = providerRaw as ProviderId;

  const typedKey = normalize(formData.get("api_key"));
  const baseUrl = normalize(formData.get("base_url"));
  const chatModel = normalize(formData.get("chat_model"));
  const extractModel = normalize(formData.get("extract_model"));

  // 表单留空 = 「沿用已存的 key」（页面不再把明文 key 送到浏览器）。
  // ⚠️ 只有 provider 没变时才复用 —— 否则会拿旧厂商的 key 去测新厂商，
  // 报一个假的「连接失败」，而用户根本没配错任何东西。
  const apiKey = typedKey ?? (await reusableKeyFor(user.id, provider));

  try {
    const config = resolveConfig({
      provider,
      api_key: apiKey,
      base_url: baseUrl,
      chat_model: chatModel,
      extract_model: extractModel,
    });
    const instance = buildProvider(config);

    // 一个最小提取调用：要求模型返回 { ok: true }
    const TestSchema = z.object({ ok: z.boolean() });
    await instance.extract({
      system: "测试连接。请严格按 schema 返回 { ok: true }。",
      userInput: "ping",
      schema: TestSchema,
      maxTokens: 64,
    });

    return { ok: true };
  } catch (err) {
    if (err instanceof LlmProviderError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "测试失败" };
  }
}
