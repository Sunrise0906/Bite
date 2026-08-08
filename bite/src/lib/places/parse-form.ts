// 店铺表单字段的解析 / 校验。
//
// 抽出来是因为 lib/actions/places.ts 和 lib/actions/quick-add.ts 各有一份**逐字节相同**
// 的拷贝：加一个价位档要改两处并祈祷没漏。纯函数，无 Supabase 依赖，可单测。

import type { PlacePrice, PlaceStatus } from "@/lib/db/types";

export const VALID_STATUS: PlaceStatus[] = [
  "want_to_go",
  "visited",
  "archived",
];
export const VALID_PRICE: PlacePrice[] = ["$", "$$", "$$$", "$$$$"];

/**
 * 标签串 → 去空的标签数组。
 * 分隔符同时接受英文逗号、中文逗号、顿号和任意空白 —— 用户从小红书粘过来的
 * 内容三种都会出现。
 */
export function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 非法 / 缺失一律回落 want_to_go（加店的默认语义就是「想去」）。 */
export function parseStatus(raw: FormDataEntryValue | null): PlaceStatus {
  return VALID_STATUS.includes(raw as PlaceStatus)
    ? (raw as PlaceStatus)
    : "want_to_go";
}

/** 价位是选填：空串和非法值都回 null，不要瞎猜。 */
export function parsePrice(raw: FormDataEntryValue | null): PlacePrice | null {
  if (typeof raw !== "string" || raw === "") return null;
  return VALID_PRICE.includes(raw as PlacePrice) ? (raw as PlacePrice) : null;
}
