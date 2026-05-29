// 长会话上下文裁剪。纯函数，从 /api/chat route 抽出来好单测——
// 这里的 bug 会让 LLM API 直接 400（孤立 tool_result）或更糟，值得测试兜底。

type TrimmableRow = {
  role: "user" | "assistant";
  content: Array<{ type: string }>;
};

/**
 * 超过 maxTurns 条消息时，只保留最近 keepTurns 条，防 token 失控。
 *
 * 关键约束：**从消息边界裁剪，不在块中间切**。LLM API 要求每个 tool_result
 * 紧跟在产生它的 tool_use（assistant 消息）之后。如果裁剪后的开头是一条"纯
 * tool_result 的 user 消息"，它对应的 tool_use 已被切掉 → 孤立 tool_result →
 * 请求被拒。所以从初始 cutoff 往后挪，直到落在一个非纯-tool_result 的消息上。
 *
 * @returns rows 裁剪后的消息（未超阈值时原样返回）；truncated 是否发生了裁剪
 */
export function trimHistory<T extends TrimmableRow>(
  rows: T[],
  opts: { maxTurns: number; keepTurns: number },
): { rows: T[]; truncated: boolean } {
  const { maxTurns, keepTurns } = opts;
  if (rows.length <= maxTurns) return { rows, truncated: false };

  let cutoff = rows.length - keepTurns;
  // 往后找一个干净边界。cutoff < rows.length 是防御性上界：正常情况下最后一条
  // 总是 user-text（新消息 / regenerate 的锚点），循环会先 break；万一不变式被
  // 破坏也不越界，最差返回空切片而不是崩。
  while (cutoff > 0 && cutoff < rows.length) {
    const row = rows[cutoff];
    const onlyToolResult =
      row.role === "user" &&
      row.content.every((b) => b.type === "tool_result");
    if (!onlyToolResult) break;
    cutoff++;
  }

  return { rows: rows.slice(cutoff), truncated: true };
}

/**
 * 上一次请求若在写 assistant(tool_use) 之后、写对应 user(tool_result) 之前崩了
 * （进程被 kill / appendMessage 静默失败），DB 尾巴会留下孤立的 assistant(tool_use)。
 * 直接拼新 user-text 发给 provider，Anthropic 会 400 "tool_use ids must be followed
 * by tool_result blocks"，整条会话永久坏掉。
 *
 * 这里把尾部任何含 tool_use 的 assistant 消息丢掉——AI 丢一次工具记忆，但对话能继续。
 */
export function sanitizeTailOrphan<T extends TrimmableRow>(rows: T[]): T[] {
  let end = rows.length;
  while (end > 0) {
    const last = rows[end - 1];
    if (
      last.role === "assistant" &&
      last.content.some((b) => b.type === "tool_use")
    ) {
      end--;
      continue;
    }
    break;
  }
  return end === rows.length ? rows : rows.slice(0, end);
}
