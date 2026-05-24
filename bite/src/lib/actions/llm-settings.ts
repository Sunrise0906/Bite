"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { buildProvider, resolveConfig } from "@/lib/llm/router";
import { LlmProviderError, type ProviderId } from "@/lib/llm/types";

export type LlmSettingsFormState = {
  error: string | null;
  ok?: boolean;
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
  _prev: LlmSettingsFormState,
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

  // 注意：我们允许 api_key 为空（让用户走 app 默认 key）
  // key 没贴满长度的话，给个温柔的提醒，但不阻止
  if (apiKey && apiKey.length < 10) {
    return { error: "API key 看起来太短了，确认一下？" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_llm_settings")
    .upsert(
      {
        user_id: user.id,
        provider,
        api_key: apiKey,
        base_url: baseUrl,
        chat_model: chatModel,
        extract_model: extractModel,
      },
      { onConflict: "user_id" },
    );

  if (error) return { error: `保存失败：${error.message}` };

  revalidatePath("/profile");
  return { error: null, ok: true };
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
  await requireUser();

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

  const apiKey = normalize(formData.get("api_key"));
  const baseUrl = normalize(formData.get("base_url"));
  const chatModel = normalize(formData.get("chat_model"));
  const extractModel = normalize(formData.get("extract_model"));

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
