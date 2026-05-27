// Place 字段合并 / 去重的纯函数。
//
// 从 quick-add / recommendations 两个 server action 里抽出来：
//   1. 这些是数据完整性最易出 bug 的地方（去重、合并 reasons），需要单测兜底
//   2. 之前两处各写一份 union/merge 逻辑，会随时间漂移——收敛到这里只此一份
//
// 纯函数：不依赖 Supabase / 网络 / Next，可直接在 vitest 里测。

export type PlaceReasonEntry = { user_id: string; text: string };

function asReasonList(existing: unknown): PlaceReasonEntry[] {
  return Array.isArray(existing)
    ? (existing as PlaceReasonEntry[]).filter(
        (r) =>
          r &&
          typeof r.user_id === "string" &&
          typeof r.text === "string",
      )
    : [];
}

/**
 * 字符串数组 union 去重，**保序**：existing 在前，只追加 incoming 里没出现过的值。
 * existing 不是数组、或含非字符串脏值时安全降级（DB JSON 字段可能不干净）。
 */
export function unionStrings(
  existing: unknown,
  incoming: readonly string[],
): string[] {
  const ex: string[] = Array.isArray(existing)
    ? (existing as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const seen = new Set(ex);
  const out = [...ex];
  for (const x of incoming) {
    if (!seen.has(x)) {
      out.push(x);
      seen.add(x);
    }
  }
  return out;
}

/**
 * 合并 reasons[]（共享 list 里每个用户一条想去理由）。
 * - overrideMyReason=true（单店表单，用户手动编辑过）：替换当前 user 的 reason；
 *   newReason 为空表示删除自己的 reason。别人的 reason 始终保留。
 * - overrideMyReason=false（批量 AI 抽取，未手编）：仅在用户原本没 reason 时才追加，
 *   不覆盖用户已写过的。
 */
export function mergeReasons(
  existing: unknown,
  userId: string,
  newReason: string | null,
  overrideMyReason: boolean,
): PlaceReasonEntry[] {
  const list = asReasonList(existing);
  const others = list.filter((r) => r.user_id !== userId);
  const mine = list.find((r) => r.user_id === userId);

  if (overrideMyReason) {
    return newReason
      ? [...others, { user_id: userId, text: newReason }]
      : others;
  }
  // 批量场景：用户已有 reason 就原样保留，不动
  if (mine) return list;
  return newReason
    ? [...others, { user_id: userId, text: newReason }]
    : others;
}

/**
 * 按 (user_id, text) 精确去重地追加一条 reason（接受朋友推荐时用）。
 * 已存在完全相同的条目则原样返回，避免重复点「接受」时堆叠。
 */
export function appendReasonDedup(
  existing: unknown,
  newReason: PlaceReasonEntry | null,
): PlaceReasonEntry[] {
  const list = asReasonList(existing);
  if (!newReason) return list;
  const dup = list.some(
    (r) => r.user_id === newReason.user_id && r.text === newReason.text,
  );
  return dup ? list : [...list, newReason];
}

/**
 * 合集帖：按 AI 标注的 photo_indices 给某家店挑图。
 * 没标 / 标了空 / 图集本身为空 → 回退到全部图（宁可多给让用户在确认页删，
 * 也比强行平均切、把别家的图配给这家强）。
 * 索引会过滤掉越界和非整数；若过滤后一张都不剩，同样回退全部图。
 */
export function pickPhotosByIndices(
  indices: number[] | undefined,
  allPhotos: readonly string[],
): string[] {
  if (!indices || indices.length === 0 || allPhotos.length === 0) {
    return [...allPhotos];
  }
  const picked = indices
    .filter((i) => Number.isInteger(i) && i >= 0 && i < allPhotos.length)
    .map((i) => allPhotos[i]);
  return picked.length > 0 ? picked : [...allPhotos];
}
