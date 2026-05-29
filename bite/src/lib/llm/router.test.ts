import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConfig } from "./router";
import { LlmProviderError, PROVIDER_PRESETS } from "./types";

// 在 test 之间保存恢复 env，否则会污染其它测试
const SAVED_KEYS = [
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "DASHSCOPE_API_KEY",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of SAVED_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of SAVED_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveConfig", () => {
  it("settings=null + env 有默认 key → app_default + preset 默认值", () => {
    process.env.GEMINI_API_KEY = "env-key";
    const out = resolveConfig(null);
    expect(out.id).toBe("gemini");
    expect(out.apiKey).toBe("env-key");
    expect(out.keySource).toBe("app_default");
    expect(out.baseUrl).toBe(PROVIDER_PRESETS.gemini.baseUrl);
    expect(out.extractModel).toBe(PROVIDER_PRESETS.gemini.defaultExtractModel);
    expect(out.chatModel).toBe(PROVIDER_PRESETS.gemini.defaultChatModel);
  });

  it("user 填了 api_key → keySource=user，覆盖 env", () => {
    process.env.GEMINI_API_KEY = "env-key";
    const out = resolveConfig({
      provider: "gemini",
      api_key: "user-key",
      base_url: null,
      chat_model: null,
      extract_model: null,
    });
    expect(out.apiKey).toBe("user-key");
    expect(out.keySource).toBe("user");
  });

  it("user.api_key 是纯空白 + env 有 key → fallback 到 env", () => {
    process.env.GEMINI_API_KEY = "env-key";
    const out = resolveConfig({
      provider: "gemini",
      api_key: "   ",
      base_url: null,
      chat_model: null,
      extract_model: null,
    });
    expect(out.apiKey).toBe("env-key");
    expect(out.keySource).toBe("app_default");
  });

  it("user.api_key='' + env 有 key → fallback 到 env", () => {
    process.env.GEMINI_API_KEY = "env-key";
    const out = resolveConfig({
      provider: "gemini",
      api_key: "",
      base_url: null,
      chat_model: null,
      extract_model: null,
    });
    expect(out.keySource).toBe("app_default");
  });

  it("user.base_url / chat_model / extract_model 为空白时回退到 preset", () => {
    process.env.GEMINI_API_KEY = "env-key";
    const out = resolveConfig({
      provider: "gemini",
      api_key: "user-key",
      base_url: "   ",
      chat_model: "",
      extract_model: "   ",
    });
    expect(out.baseUrl).toBe(PROVIDER_PRESETS.gemini.baseUrl);
    expect(out.chatModel).toBe(PROVIDER_PRESETS.gemini.defaultChatModel);
    expect(out.extractModel).toBe(PROVIDER_PRESETS.gemini.defaultExtractModel);
  });

  it("user 非空字段使用自定义值", () => {
    const out = resolveConfig({
      provider: "openai",
      api_key: "user-key",
      base_url: "https://proxy.local/v1",
      chat_model: "custom-chat",
      extract_model: "custom-extract",
    });
    expect(out.baseUrl).toBe("https://proxy.local/v1");
    expect(out.chatModel).toBe("custom-chat");
    expect(out.extractModel).toBe("custom-extract");
  });

  it("双空（user 没 key + env 没 key）→ throw missing_key", () => {
    expect(() =>
      resolveConfig({
        provider: "anthropic",
        api_key: null,
        base_url: null,
        chat_model: null,
        extract_model: null,
      }),
    ).toThrow(LlmProviderError);

    try {
      resolveConfig({
        provider: "anthropic",
        api_key: null,
        base_url: null,
        chat_model: null,
        extract_model: null,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(LlmProviderError);
      const e = err as LlmProviderError;
      expect(e.kind).toBe("missing_key");
      expect(e.message).toContain("anthropic");
      expect(e.message).toContain("ANTHROPIC_API_KEY");
    }
  });

  it("回归保护：DEFAULT_PROVIDER (gemini) 没配 env 也 throw", () => {
    expect(() => resolveConfig(null)).toThrow(LlmProviderError);
  });
});
