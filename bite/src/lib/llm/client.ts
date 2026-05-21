import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!cached) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "缺少 ANTHROPIC_API_KEY 环境变量。请在 .env.local 中填入。",
      );
    }
    cached = new Anthropic({ apiKey });
  }
  return cached;
}
