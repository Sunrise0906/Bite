// 清单 category（client-safe 常量）。sql/0016。
// 愿景：不同领域的清单互相配合，AI 跨类综合（"吃完去哪玩"）。

export type ListCategory = "food" | "drink" | "activity" | "other";

export const CATEGORIES: Array<{ id: ListCategory; label: string }> = [
  { id: "food", label: "吃" },
  { id: "drink", label: "喝" },
  { id: "activity", label: "玩" },
  { id: "other", label: "其他" },
];

export const CATEGORY_LABEL: Record<ListCategory, string> = {
  food: "吃",
  drink: "喝",
  activity: "玩",
  other: "其他",
};

export function isListCategory(v: unknown): v is ListCategory {
  return v === "food" || v === "drink" || v === "activity" || v === "other";
}
