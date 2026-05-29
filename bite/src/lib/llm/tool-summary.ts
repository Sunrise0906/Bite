// chat-view 工具卡片的纯展示逻辑：
//   - labelForTool: 工具名 → 中文标签
//   - summarizeToolResult: 解析 tool_result.content (JSON 字符串) → 状态 + 一行摘要
//   - tryPrettyJson: 给详情面板的 JSON 折行，解析失败原文返回
// 抽到这里方便 vitest，分支密集（per-tool + count===0 特例 + JSON 兜底）。

export type ToolSummary = {
  kind: "ok" | "error" | "pending";
  summary: string;
};

export function labelForTool(name: string): string {
  switch (name) {
    case "search_my_list":
      return "查餐厅库";
    case "check_place_details":
      return "查看详情";
    case "add_to_list":
      return "添加到 list";
    default:
      return name;
  }
}

export function summarizeToolResult(
  toolName: string,
  content: string | undefined,
): ToolSummary {
  if (!content) return { kind: "pending", summary: "查询中..." };
  let obj: unknown;
  try {
    obj = JSON.parse(content);
  } catch {
    return { kind: "error", summary: "返回不是合法 JSON" };
  }
  if (!obj || typeof obj !== "object") {
    return { kind: "error", summary: "返回格式异常" };
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.error === "string") {
    return { kind: "error", summary: o.error };
  }
  switch (toolName) {
    case "search_my_list": {
      const count = typeof o.count === "number" ? o.count : 0;
      if (count === 0) {
        const note = typeof o.note === "string" ? `（${o.note}）` : "";
        return { kind: "ok", summary: `找到 0 家${note}` };
      }
      return { kind: "ok", summary: `找到 ${count} 家` };
    }
    case "check_place_details": {
      const name = typeof o.name === "string" ? o.name : "";
      return { kind: "ok", summary: name ? `«${name}»` : "已查看" };
    }
    case "add_to_list": {
      const name = typeof o.name === "string" ? o.name : "";
      return { kind: "ok", summary: name ? `已添加 «${name}»` : "已添加" };
    }
    default:
      return { kind: "ok", summary: "完成" };
  }
}

export function tryPrettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
