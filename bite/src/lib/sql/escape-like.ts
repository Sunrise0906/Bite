// 转义 PostgreSQL LIKE/ILIKE pattern 中的元字符。
//
// 直接把用户输入塞进 .ilike("col", value) 会让 `%` 和 `_` 当成通配符匹配，
// 例如 sendRecommendation 里 `%@gmail.com` 会枚举所有 gmail 用户。
// 把 `%`、`_`、`\` 转义成字面量后再传，行为对正常邮箱完全等价。

export function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}
