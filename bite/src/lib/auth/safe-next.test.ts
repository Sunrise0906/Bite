import { describe, it, expect } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("根路径 '/' 放行", () => {
    expect(safeNext("/")).toBe("/");
  });

  it("普通同站点路径放行", () => {
    expect(safeNext("/lists?x=1")).toBe("/lists?x=1");
  });

  it("null / 非字符串 / 空串 → fallback /lists", () => {
    expect(safeNext(null)).toBe("/lists");
    expect(safeNext("")).toBe("/lists");
  });

  it("protocol-relative //evil.com 拦下", () => {
    expect(safeNext("//evil.com")).toBe("/lists");
  });

  it("http://evil.com 这种绝对 URL 拦下", () => {
    expect(safeNext("http://evil.com")).toBe("/lists");
  });

  it("反斜杠注入 /\\evil.com 拦下（浏览器会把 \\ 当 / 解析）", () => {
    expect(safeNext("/\\evil.com")).toBe("/lists");
  });

  it("路径里任何位置出现反斜杠都拦", () => {
    expect(safeNext("/lists\\foo")).toBe("/lists");
  });
});
