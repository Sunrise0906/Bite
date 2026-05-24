import { extractXhsUrl } from "@/lib/places/xhs";

export type InputType =
  | { kind: "empty" }
  | { kind: "place_name" } // 短文本 → Places autocomplete
  | { kind: "free_text"; hasXhsUrl: boolean }; // 长文本 / 含 XHS 链接 → AI 提取

// 短文本阈值：≤12 字符且无换行
const SHORT_LEN = 12;

export function detectInputType(input: string): InputType {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty" };

  const xhsUrl = extractXhsUrl(trimmed);

  if (xhsUrl) {
    return { kind: "free_text", hasXhsUrl: true };
  }

  if (trimmed.length <= SHORT_LEN && !trimmed.includes("\n")) {
    return { kind: "place_name" };
  }

  return { kind: "free_text", hasXhsUrl: false };
}
