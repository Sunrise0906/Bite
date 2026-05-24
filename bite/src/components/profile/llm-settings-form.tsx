"use client";

import { useActionState, useState } from "react";
import {
  saveLlmSettings,
  clearLlmSettings,
  testLlmConnection,
  type LlmSettingsFormState,
} from "@/lib/actions/llm-settings";
import {
  PROVIDER_FREE_TIER,
  PROVIDER_LABELS,
  PROVIDER_PRESETS,
  type ProviderId,
} from "@/lib/llm/types";

type Props = {
  initial: {
    provider: ProviderId;
    api_key: string | null;
    base_url: string | null;
    chat_model: string | null;
    extract_model: string | null;
  } | null;
  /** 用户当前实际生效的 key 来自哪里 */
  appKeyAvailable: Record<ProviderId, boolean>;
};

const PROVIDER_ORDER: ProviderId[] = [
  "gemini",
  "anthropic",
  "openai",
  "deepseek",
  "qwen",
];

// 每个 provider 列几个常见模型给 datalist 选（用户也可以自由填）
const MODEL_PRESETS: Record<
  ProviderId,
  { chat: string[]; extract: string[] }
> = {
  gemini: {
    chat: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    extract: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
  },
  anthropic: {
    chat: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"],
    extract: ["claude-haiku-4-5", "claude-sonnet-4-6"],
  },
  openai: {
    chat: ["gpt-5", "gpt-5-mini", "gpt-4o"],
    extract: ["gpt-5-mini", "gpt-4o-mini"],
  },
  deepseek: {
    chat: ["deepseek-chat", "deepseek-reasoner"],
    extract: ["deepseek-chat"],
  },
  qwen: {
    chat: ["qwen-plus", "qwen-max", "qwen-turbo"],
    extract: ["qwen-turbo", "qwen-plus"],
  },
};

export function LlmSettingsForm({ initial, appKeyAvailable }: Props) {
  const [provider, setProvider] = useState<ProviderId>(
    initial?.provider ?? "gemini",
  );
  const [showKey, setShowKey] = useState(false);
  const [advanced, setAdvanced] = useState(
    Boolean(initial?.base_url || initial?.chat_model || initial?.extract_model),
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true } | { error: string } | null
  >(null);

  const [state, action, pending] = useActionState<
    LlmSettingsFormState,
    FormData
  >(saveLlmSettings, { error: null });

  const preset = PROVIDER_PRESETS[provider];
  const isInitialProvider = initial?.provider === provider;
  const currentApiKey = isInitialProvider ? (initial?.api_key ?? "") : "";
  const currentBaseUrl = isInitialProvider ? (initial?.base_url ?? "") : "";
  const currentChatModel = isInitialProvider ? (initial?.chat_model ?? "") : "";
  const currentExtractModel = isInitialProvider
    ? (initial?.extract_model ?? "")
    : "";

  const hasAppDefault = appKeyAvailable[provider];

  return (
    <form action={action} className="flex flex-col gap-5">
      {/* ---- provider 选择 ---- */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Provider
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PROVIDER_ORDER.map((id) => {
            const active = provider === id;
            const isFree = PROVIDER_FREE_TIER[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setProvider(id);
                  setTestResult(null);
                }}
                className={`relative rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  active
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-soft-text)]"
                    : "border-[var(--border-subtle)] bg-white text-[var(--text-default)] hover:border-[var(--primary)]/40"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{PROVIDER_LABELS[id]}</span>
                  {isFree && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                      免费
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">
                  {PROVIDER_PRESETS[id].defaultExtractModel}
                </div>
              </button>
            );
          })}
        </div>
        <input type="hidden" name="provider" value={provider} />
      </div>

      {/* ---- API key ---- */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="api_key"
            className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
          >
            API Key（可选）
          </label>
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            {showKey ? "隐藏" : "显示"}
          </button>
        </div>
        <input
          id="api_key"
          name="api_key"
          type={showKey ? "text" : "password"}
          defaultValue={currentApiKey}
          key={`api_key_${provider}`}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            hasAppDefault ? "留空走 app 默认 key" : "未配置 app key，请填入"
          }
          className="field-input font-mono text-sm"
        />
        <p className="text-xs text-zinc-500">
          {hasAppDefault ? (
            <>
              已配置 app 默认 key —— 留空即用我们的额度，填入则走你自己的额度。
            </>
          ) : (
            <span className="text-amber-700">
              ⚠ {PROVIDER_LABELS[provider]} 没有 app 默认 key，必须填入才能用。
            </span>
          )}
        </p>
      </div>

      {/* ---- 进阶设置 ---- */}
      <div>
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="text-xs text-[var(--primary)] hover:underline"
        >
          {advanced ? "▾ 收起进阶设置" : "▸ 进阶设置（自定义 base URL / 模型）"}
        </button>

        {advanced && (
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="base_url"
                className="text-xs font-medium text-zinc-600"
              >
                Base URL
              </label>
              <input
                id="base_url"
                name="base_url"
                type="url"
                defaultValue={currentBaseUrl}
                key={`base_url_${provider}`}
                placeholder={preset.baseUrl}
                className="field-input font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="extract_model"
                  className="text-xs font-medium text-zinc-600"
                >
                  Extract Model
                </label>
                <input
                  id="extract_model"
                  name="extract_model"
                  type="text"
                  list={`extract_options_${provider}`}
                  defaultValue={currentExtractModel}
                  key={`extract_model_${provider}`}
                  placeholder={preset.defaultExtractModel}
                  className="field-input font-mono text-sm"
                />
                <datalist id={`extract_options_${provider}`}>
                  {MODEL_PRESETS[provider].extract.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="chat_model"
                  className="text-xs font-medium text-zinc-600"
                >
                  Chat Model
                </label>
                <input
                  id="chat_model"
                  name="chat_model"
                  type="text"
                  list={`chat_options_${provider}`}
                  defaultValue={currentChatModel}
                  key={`chat_model_${provider}`}
                  placeholder={preset.defaultChatModel}
                  className="field-input font-mono text-sm"
                />
                <datalist id={`chat_options_${provider}`}>
                  {MODEL_PRESETS[provider].chat.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- 错误 / 成功提示 ---- */}
      {state.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && (
        <p className="text-sm text-emerald-700">已保存 ✓</p>
      )}

      {/* ---- 测试结果 ---- */}
      {testResult && "ok" in testResult && (
        <p className="text-sm text-emerald-700">连接成功 ✓ 模型有响应</p>
      )}
      {testResult && "error" in testResult && (
        <p role="alert" className="text-sm text-red-700">
          连接失败：{testResult.error}
        </p>
      )}

      {/* ---- 按钮 ---- */}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary flex-1 py-2.5 text-sm"
        >
          {pending ? "保存中..." : "保存设置"}
        </button>
        <button
          type="button"
          disabled={testing || pending}
          onClick={async (e) => {
            // 从表单读取当前值
            const form = e.currentTarget.closest("form");
            if (!form) return;
            setTesting(true);
            setTestResult(null);
            try {
              const fd = new FormData(form);
              const result = await testLlmConnection(fd);
              setTestResult(result);
            } catch (err) {
              setTestResult({
                error: err instanceof Error ? err.message : "测试失败",
              });
            } finally {
              setTesting(false);
            }
          }}
          className="btn-secondary px-4 py-2.5 text-sm"
        >
          {testing ? "测试中..." : "测试连接"}
        </button>
        {initial && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (!confirm("重置为 app 默认设置？你填的 key 会被清空。")) return;
              await clearLlmSettings();
            }}
            className="btn-secondary px-4 py-2.5 text-sm"
          >
            重置默认
          </button>
        )}
      </div>
    </form>
  );
}
