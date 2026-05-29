import { describe, it, expect } from "vitest";
import { safeDecodeURIComponent } from "./safe-decode";

describe("safeDecodeURIComponent", () => {
  it("合法 percent 编码正常解码", () => {
    expect(safeDecodeURIComponent("hello%20world")).toBe("hello world");
    expect(safeDecodeURIComponent("%E4%B8%AD%E6%96%87")).toBe("中文");
  });

  it("普通字符串原样返回", () => {
    expect(safeDecodeURIComponent("plain text")).toBe("plain text");
  });

  it("非法 percent 序列 %C0 不抛，返回原文", () => {
    expect(() => safeDecodeURIComponent("%C0")).not.toThrow();
    expect(safeDecodeURIComponent("%C0")).toBe("%C0");
  });

  it("孤立的 % 不抛", () => {
    expect(() => safeDecodeURIComponent("%")).not.toThrow();
    expect(safeDecodeURIComponent("%")).toBe("%");
  });

  it("空字符串", () => {
    expect(safeDecodeURIComponent("")).toBe("");
  });
});
