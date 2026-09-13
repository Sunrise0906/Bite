// /api/mobile/llm-settings —— AI 模型设置。
// key 在服务端加密落库（BITE_SETTINGS_SECRET），App 永远拿不到明文，只拿「有没有」。
//   GET    → 当前设置 + 哪些 provider 有 app 默认 key + 今日共享额度用量
//   POST   → 保存（复用网页的 saveLlmSettings，四态语义一致）
//   DELETE → 重置为 app 默认

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import {
  clearLlmSettings,
  saveLlmSettings,
} from "@/lib/actions/llm-settings";
import { PROVIDER_PRESETS, type ProviderId } from "@/lib/llm/types";
import { dailyQuota } from "@/lib/llm/quota";

export const runtime = "nodejs";

const PROVIDERS: ProviderId[] = ["gemini", "anthropic", "openai", "deepseek", "qwen"];

export const GET = mobileRoute(async ({ scope }) => {
  const [{ data: row }, { data: quotaRow }] = await Promise.all([
    scope.supabase
      .from("user_llm_settings")
      .select("provider, api_key, base_url, chat_model, extract_model")
      .eq("user_id", scope.user.id)
      .maybeSingle<{
        provider: ProviderId;
        api_key: string | null;
        base_url: string | null;
        chat_model: string | null;
        extract_model: string | null;
      }>(),
    scope.supabase
      .from("llm_usage")
      .select("calls")
      .eq("user_id", scope.user.id)
      .eq("day", new Date().toISOString().slice(0, 10))
      .maybeSingle<{ calls: number }>(),
  ]);

  const appKeyAvailable = Object.fromEntries(
    PROVIDERS.map((id) => [
      id,
      Boolean(process.env[PROVIDER_PRESETS[id].apiKeyEnvVar]?.trim()),
    ]),
  );

  return jsonOk({
    settings: row
      ? {
          provider: row.provider,
          has_api_key: Boolean(row.api_key),
          base_url: row.base_url,
          chat_model: row.chat_model,
          extract_model: row.extract_model,
        }
      : null,
    app_key_available: appKeyAvailable,
    used_today: quotaRow?.calls ?? 0,
    quota: dailyQuota(),
    presets: Object.fromEntries(
      PROVIDERS.map((id) => [
        id,
        {
          base_url: PROVIDER_PRESETS[id].baseUrl,
          chat_model: PROVIDER_PRESETS[id].defaultChatModel,
          extract_model: PROVIDER_PRESETS[id].defaultExtractModel,
        },
      ]),
    ),
  });
});

function toFormData(b: Record<string, unknown>): FormData {
  const fd = new FormData();
  fd.set("provider", str(b.provider, 20));
  fd.set("api_key", str(b.api_key, 500));
  fd.set("clear_api_key", b.clear_api_key === true ? "1" : "");
  fd.set("base_url", str(b.base_url, 500));
  fd.set("chat_model", str(b.chat_model, 100));
  fd.set("extract_model", str(b.extract_model, 100));
  return fd;
}

export const POST = mobileRoute(async ({ req }) => {
  const b = await readJsonBody<Record<string, unknown>>(req);
  const r = await saveLlmSettings({ error: null }, toFormData(b));
  if (r.error) return jsonError(r.error, 422);
  return jsonOk({ ok: true });
});

export const DELETE = mobileRoute(async () => {
  await clearLlmSettings();
  return jsonOk({ ok: true });
});

