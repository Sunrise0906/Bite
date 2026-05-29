// visit 表单的输入解析 + 校验，纯函数好测。
// 注意 parseVisitedAt 故意把日期拼成 T12:00:00 防 UTC 偏移把 "今天" 打回前一天
// （<input type="date"> 发的是 YYYY-MM-DD 本地日期）。

import type { VisitSentiment } from "@/lib/db/types";

export const VALID_SENTIMENTS: VisitSentiment[] = [
  "will_return",
  "okay",
  "wont_return",
];

export function normalize(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function parseStar(
  formData: FormData,
):
  | { ok: true; value: number | null }
  | { ok: false; error: string } {
  const raw = formData.get("star_rating");
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: true, value: null };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { ok: false, error: "星级要在 1-5 之间" };
  }
  return { ok: true, value: n };
}

export function parseVisitedAt(
  formData: FormData,
): { ok: true; iso: string } | { ok: false; error: string } {
  const raw = normalize(formData.get("visited_at"));
  if (!raw) return { ok: true, iso: new Date().toISOString() };
  // 用户填的是 YYYY-MM-DD（本地）；补 12:00 防止 UTC 偏移到前一天
  // —— 不要去掉 T12:00:00，是回归保护：PST 用户的 2026-05-29 不能被打回 2026-05-28
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { ok: false, error: "日期格式不对" };
  return { ok: true, iso: d.toISOString() };
}

export function parseSentiment(
  formData: FormData,
):
  | { ok: true; value: VisitSentiment }
  | { ok: false; error: string } {
  const raw = String(formData.get("sentiment") ?? "");
  if (!VALID_SENTIMENTS.includes(raw as VisitSentiment)) {
    return { ok: false, error: "请选择体验评价" };
  }
  return { ok: true, value: raw as VisitSentiment };
}
