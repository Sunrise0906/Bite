import { describe, it, expect } from "vitest";
import {
  labelForTool,
  summarizeToolResult,
  tryPrettyJson,
} from "./tool-summary";

describe("labelForTool", () => {
  it("已知工具映射成中文", () => {
    expect(labelForTool("search_my_list")).toBe("查餐厅库");
    expect(labelForTool("check_place_details")).toBe("查看详情");
    expect(labelForTool("add_to_list")).toBe("添加到 list");
  });

  it("未知工具原样返回", () => {
    expect(labelForTool("foo_bar")).toBe("foo_bar");
  });
});

describe("summarizeToolResult", () => {
  it("content=undefined → pending", () => {
    expect(summarizeToolResult("search_my_list", undefined)).toEqual({
      kind: "pending",
      summary: "查询中...",
    });
  });

  it("非法 JSON → error 返回不是合法 JSON", () => {
    expect(summarizeToolResult("search_my_list", "not json{")).toEqual({
      kind: "error",
      summary: "返回不是合法 JSON",
    });
  });

  it("JSON 不是 object → 返回格式异常", () => {
    expect(summarizeToolResult("search_my_list", "null").kind).toBe("error");
    expect(summarizeToolResult("search_my_list", "\"str\"").kind).toBe("error");
    expect(summarizeToolResult("search_my_list", "123").kind).toBe("error");
    expect(summarizeToolResult("search_my_list", "null").summary).toBe(
      "返回格式异常",
    );
  });

  it("有 error 字段优先用 error", () => {
    expect(
      summarizeToolResult("search_my_list", JSON.stringify({ error: "找不到这家店" })),
    ).toEqual({ kind: "error", summary: "找不到这家店" });
  });

  describe("search_my_list", () => {
    it("count=3 → 找到 3 家", () => {
      expect(
        summarizeToolResult(
          "search_my_list",
          JSON.stringify({ count: 3 }),
        ),
      ).toEqual({ kind: "ok", summary: "找到 3 家" });
    });

    it("count=0 无 note → 找到 0 家", () => {
      expect(
        summarizeToolResult(
          "search_my_list",
          JSON.stringify({ count: 0 }),
        ),
      ).toEqual({ kind: "ok", summary: "找到 0 家" });
    });

    it("count=0 + note → 带括号附 note", () => {
      expect(
        summarizeToolResult(
          "search_my_list",
          JSON.stringify({ count: 0, note: "库里空" }),
        ),
      ).toEqual({ kind: "ok", summary: "找到 0 家（库里空）" });
    });

    it("count 不是 number → 走 0 分支", () => {
      expect(
        summarizeToolResult(
          "search_my_list",
          JSON.stringify({ count: "x" }),
        ).summary,
      ).toBe("找到 0 家");
    });
  });

  describe("check_place_details", () => {
    it("有 name → «name»", () => {
      expect(
        summarizeToolResult(
          "check_place_details",
          JSON.stringify({ name: "海底捞" }),
        ),
      ).toEqual({ kind: "ok", summary: "«海底捞»" });
    });

    it("无 name → 已查看", () => {
      expect(
        summarizeToolResult("check_place_details", JSON.stringify({})),
      ).toEqual({ kind: "ok", summary: "已查看" });
    });
  });

  describe("add_to_list", () => {
    it("有 name → 已添加 «name»", () => {
      expect(
        summarizeToolResult(
          "add_to_list",
          JSON.stringify({ name: "鼎泰丰" }),
        ),
      ).toEqual({ kind: "ok", summary: "已添加 «鼎泰丰»" });
    });

    it("无 name → 已添加", () => {
      expect(
        summarizeToolResult("add_to_list", JSON.stringify({})),
      ).toEqual({ kind: "ok", summary: "已添加" });
    });
  });

  it("未知工具 → 完成", () => {
    expect(
      summarizeToolResult("foo_bar", JSON.stringify({ x: 1 })),
    ).toEqual({ kind: "ok", summary: "完成" });
  });
});

describe("tryPrettyJson", () => {
  it("合法 JSON → 2 空格缩进", () => {
    expect(tryPrettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("非法 → 原文返回不抛", () => {
    expect(() => tryPrettyJson("not json")).not.toThrow();
    expect(tryPrettyJson("not json")).toBe("not json");
  });
});

describe("find_similar_places（四个工具里此前唯一没有 case 的，会渲染裸 snake_case）", () => {
  it("labelForTool 有中文标签", () => {
    expect(labelForTool("find_similar_places")).toBe("找相似的店");
  });

  it("有候选 → 带参照店名和数量", () => {
    const r = summarizeToolResult(
      "find_similar_places",
      JSON.stringify({ reference: "海底捞", candidates: [{ name: "A" }, { name: "B" }] }),
    );
    expect(r.kind).toBe("ok");
    expect(r.summary).toBe("像 «海底捞» 的找到 2 家");
  });

  it("零候选 → 带 note", () => {
    const r = summarizeToolResult(
      "find_similar_places",
      JSON.stringify({ reference: "海底捞", candidates: [], note: "换个说法" }),
    );
    expect(r.summary).toBe("没找到相似的（换个说法）");
  });

  it("缺 reference 时退化成只报数量", () => {
    const r = summarizeToolResult(
      "find_similar_places",
      JSON.stringify({ candidates: [{ name: "A" }] }),
    );
    expect(r.summary).toBe("找到 1 家");
  });

  it("error 字段优先于 per-tool 分支", () => {
    const r = summarizeToolResult(
      "find_similar_places",
      JSON.stringify({ error: "找不到参照店" }),
    );
    expect(r.kind).toBe("error");
    expect(r.summary).toBe("找不到参照店");
  });
});
