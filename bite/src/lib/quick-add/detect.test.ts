import { describe, it, expect } from "vitest";
import { detectInputType } from "./detect";

describe("detectInputType", () => {
  it("空 / 纯空白 → empty", () => {
    expect(detectInputType("")).toEqual({ kind: "empty" });
    expect(detectInputType("   \n ")).toEqual({ kind: "empty" });
  });

  it("短文本（≤12 字符、无换行）→ place_name，走 Places 补全", () => {
    expect(detectInputType("海底捞")).toEqual({ kind: "place_name" });
    expect(detectInputType("Sushi Time")).toEqual({ kind: "place_name" });
  });

  it("12 字符边界 → 仍是 place_name", () => {
    expect(detectInputType("a".repeat(12))).toEqual({ kind: "place_name" });
  });

  it("超过 12 字符 → free_text，交给 AI 抽取", () => {
    expect(detectInputType("a".repeat(13))).toEqual({
      kind: "free_text",
      hasXhsUrl: false,
    });
  });

  it("短文本但含换行 → free_text（多半是粘贴的内容）", () => {
    expect(detectInputType("好吃\n推荐")).toEqual({
      kind: "free_text",
      hasXhsUrl: false,
    });
  });

  it("含小红书链接 → free_text 且 hasXhsUrl=true（即使整体很短）", () => {
    expect(detectInputType("http://xhslink.com/a/xyz")).toEqual({
      kind: "free_text",
      hasXhsUrl: true,
    });
    expect(
      detectInputType("看看这家 https://www.xiaohongshu.com/explore/abc123"),
    ).toEqual({ kind: "free_text", hasXhsUrl: true });
  });

  it("长正文无链接 → free_text 且 hasXhsUrl=false", () => {
    expect(
      detectInputType(
        "这家川菜馆在尔湾，水煮鱼很正宗，朋友推荐的，周末人多要排队",
      ),
    ).toEqual({ kind: "free_text", hasXhsUrl: false });
  });
});
