import { describe, it, expect } from "vitest";
import { trimHistory, sanitizeTailOrphan } from "./trim-history";

// 测试用行：带 id 方便断言裁剪后留下哪几条
type Row = { id: string; role: "user" | "assistant"; content: { type: string }[] };
const u = (id: string): Row => ({ id, role: "user", content: [{ type: "text" }] });
const a = (id: string): Row => ({ id, role: "assistant", content: [{ type: "text" }] });
const toolUse = (id: string): Row => ({
  id,
  role: "assistant",
  content: [{ type: "tool_use" }],
});
const toolResult = (id: string): Row => ({
  id,
  role: "user",
  content: [{ type: "tool_result" }],
});

describe("trimHistory", () => {
  it("未超阈值：原样返回，truncated=false", () => {
    const rows = [u("0"), a("1"), u("2")];
    const out = trimHistory(rows, { maxTurns: 4, keepTurns: 2 });
    expect(out.truncated).toBe(false);
    expect(out.rows).toBe(rows); // 同引用，没动
  });

  it("正好等于阈值：不裁剪", () => {
    const rows = [u("0"), a("1"), u("2"), a("3")];
    const out = trimHistory(rows, { maxTurns: 4, keepTurns: 2 });
    expect(out.truncated).toBe(false);
  });

  it("超阈值且边界干净：裁到最近 keepTurns 条", () => {
    const rows = [u("0"), a("1"), u("2"), a("3"), u("4"), a("5")];
    const out = trimHistory(rows, { maxTurns: 4, keepTurns: 2 });
    expect(out.truncated).toBe(true);
    expect(out.rows.map((r) => r.id)).toEqual(["4", "5"]);
  });

  it("边界落在纯 tool_result user 消息：往后挪，不留孤立 tool_result", () => {
    // cutoff 初值落在 tool_result-only 行，应跳过它直到非 tool_result 边界
    const rows = [
      u("u0"),
      toolUse("a1"),
      toolResult("ur2"),
      a("a3"),
      u("u4"),
      a("a5"),
      u("u6"),
    ];
    // length 7，keepTurns 5 → cutoff 初值 2（ur2），跳到 3（a3）
    const out = trimHistory(rows, { maxTurns: 4, keepTurns: 5 });
    expect(out.truncated).toBe(true);
    expect(out.rows[0].id).toBe("a3"); // 不是 ur2
    expect(out.rows.map((r) => r.id)).toEqual(["a3", "u4", "a5", "u6"]);
  });

  it("裁剪后开头绝不是纯 tool_result 的 user 消息", () => {
    const rows = [
      u("u0"),
      toolUse("a1"),
      toolResult("ur2"),
      toolUse("a3"),
      toolResult("ur4"),
      a("a5"),
      u("u6"),
    ];
    const out = trimHistory(rows, { maxTurns: 3, keepTurns: 4 });
    const first = out.rows[0];
    const firstIsOrphanToolResult =
      first.role === "user" &&
      first.content.every((b) => b.type === "tool_result");
    expect(firstIsOrphanToolResult).toBe(false);
  });

  it("防御：cutoff 之后全是 tool_result-only 也不崩（返回空切片）", () => {
    const rows = [
      u("u0"),
      toolResult("ur1"),
      toolResult("ur2"),
      toolResult("ur3"),
      toolResult("ur4"),
    ];
    // 不应抛错（原实现 cutoff 无上界会越界 .role 崩）
    const out = trimHistory(rows, { maxTurns: 2, keepTurns: 2 });
    expect(out.truncated).toBe(true);
    expect(out.rows).toEqual([]);
  });
});

describe("sanitizeTailOrphan", () => {
  it("尾部是 assistant(tool_use) → 丢掉", () => {
    const rows = [u("u0"), a("a1"), u("u2"), toolUse("a3")];
    const out = sanitizeTailOrphan(rows);
    expect(out.map((r) => r.id)).toEqual(["u0", "a1", "u2"]);
  });

  it("尾部是干净 assistant(text) → 不动（同引用）", () => {
    const rows = [u("u0"), a("a1")];
    const out = sanitizeTailOrphan(rows);
    expect(out).toBe(rows);
  });

  it("尾部 user(text) → 不动", () => {
    const rows = [a("a0"), u("u1")];
    const out = sanitizeTailOrphan(rows);
    expect(out).toBe(rows);
  });

  it("连续多条孤立 tool_use → 全部丢掉", () => {
    const rows = [u("u0"), a("a1"), toolUse("a2"), toolUse("a3")];
    const out = sanitizeTailOrphan(rows);
    expect(out.map((r) => r.id)).toEqual(["u0", "a1"]);
  });

  it("空数组 → 返回空，不崩", () => {
    expect(sanitizeTailOrphan([])).toEqual([]);
  });

  it("assistant 消息混合 text + tool_use 也算孤立（被 LLM 视为 tool_use 一轮）", () => {
    const mixed: Row = {
      id: "a-mix",
      role: "assistant",
      content: [{ type: "text" }, { type: "tool_use" }],
    };
    const rows = [u("u0"), mixed];
    const out = sanitizeTailOrphan(rows);
    expect(out.map((r) => r.id)).toEqual(["u0"]);
  });
});
