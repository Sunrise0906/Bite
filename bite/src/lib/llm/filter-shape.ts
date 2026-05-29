// LLM 工具入参容错形整理。
//
// 背景：模型即使 schema 写 `type: "string"` 也会偶发塞数组（反之亦然）。
// 生产 bug：search_my_list 拿到 status: ["want_to_go","visited"]，
// 之前代码直接 .eq("status", arr) → Supabase 把数组拼成 "want_to_go,visited"
// 喂给 enum 列 → invalid input value for enum place_status。
//
// 这里把"可能是数组、可能是单值、可能是空"的入参，归一为 string[]：
//   - undefined / null / "" / []        → []     （调用方跳过这个过滤器）
//   - "x"                                → ["x"]
//   - ["x", "y"]                         → ["x", "y"]
//   - ["x", "", null]（夹杂脏值）          → ["x"]
//
// 不对值做白名单校验（让 DB 自己拒——避免这层 enum 名单和 SQL 漂移）。

export function normalizeFilterValues(input: unknown): string[] {
  if (input == null) return [];
  const arr = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) out.push(t);
  }
  return out;
}
