export type InputType =
  | { kind: "empty" }
  | { kind: "xhs_url" } // 含小红书 URL → 提示用户粘贴正文
  | { kind: "place_name" } // 短文本 → Google Places autocomplete
  | { kind: "free_text" }; // 长文本 → AI 提取

const XHS_URL_RE = /(xhs\.cn|xiaohongshu\.com|xhslink\.com)/i;

// 短文本阈值：≤12 字符且无换行
const SHORT_LEN = 12;

export function detectInputType(input: string): InputType {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty" };
  if (XHS_URL_RE.test(trimmed)) return { kind: "xhs_url" };
  if (trimmed.length <= SHORT_LEN && !trimmed.includes("\n")) {
    return { kind: "place_name" };
  }
  return { kind: "free_text" };
}
