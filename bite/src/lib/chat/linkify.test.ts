import { describe, it, expect } from "vitest";
import { parseLinkifiedSegments } from "./linkify";

const PM = {
  店A: { id: "id-a", list_id: "list-a" },
  店B: { id: "id-b", list_id: "list-b" },
};

describe("parseLinkifiedSegments", () => {
  it("纯文本无 «» → 单个 text 段", () => {
    expect(parseLinkifiedSegments("今天吃啥", PM)).toEqual([
      { kind: "text", text: "今天吃啥" },
    ]);
  });

  it("placeMap 命中 → 生成 link，href 正确", () => {
    const out = parseLinkifiedSegments("推荐 «店A»", PM);
    expect(out).toEqual([
      { kind: "text", text: "推荐 " },
      { kind: "link", name: "店A", href: "/lists/list-a/places/id-a/edit" },
    ]);
  });

  it("未命中 → kind=raw，保留原始 «名»", () => {
    expect(parseLinkifiedSegments("看看 «不存在»", PM)).toEqual([
      { kind: "text", text: "看看 " },
      { kind: "raw", text: "«不存在»" },
    ]);
  });

  it("文本+命中+未命中+文本 混排顺序", () => {
    const out = parseLinkifiedSegments("去 «店A» 或 «未知» 试试", PM);
    expect(out).toEqual([
      { kind: "text", text: "去 " },
      { kind: "link", name: "店A", href: "/lists/list-a/places/id-a/edit" },
      { kind: "text", text: " 或 " },
      { kind: "raw", text: "«未知»" },
      { kind: "text", text: " 试试" },
    ]);
  });

  it("连续 «A»«B» 中间无空 text 段", () => {
    const out = parseLinkifiedSegments("«店A»«店B»", PM);
    expect(out).toEqual([
      { kind: "link", name: "店A", href: "/lists/list-a/places/id-a/edit" },
      { kind: "link", name: "店B", href: "/lists/list-b/places/id-b/edit" },
    ]);
  });

  it("name > 60 字 → 不匹配，整体当文本", () => {
    const longName = "店" + "x".repeat(60); // 61 chars
    const text = `«${longName}»`;
    const out = parseLinkifiedSegments(text, PM);
    expect(out).toEqual([{ kind: "text", text }]);
  });

  it("placeMap 为空 → 全部 raw", () => {
    const out = parseLinkifiedSegments("看 «店A»", {});
    expect(out).toEqual([
      { kind: "text", text: "看 " },
      { kind: "raw", text: "«店A»" },
    ]);
  });

  it("英文双引号不误匹配", () => {
    const text = '"店A"';
    expect(parseLinkifiedSegments(text, PM)).toEqual([
      { kind: "text", text },
    ]);
  });

  it("空 «» 不匹配（{1,60} 要求至少 1 个字符）", () => {
    expect(parseLinkifiedSegments("空 «»", PM)).toEqual([
      { kind: "text", text: "空 «»" },
    ]);
  });
});
