import { describe, it, expect } from "vitest";
import { extractXhsUrl, stripXhsUrl } from "./xhs";

describe("extractXhsUrl", () => {
  it("识别 xhslink 短链", () => {
    expect(extractXhsUrl("http://xhslink.com/a/xyz")).toBe(
      "http://xhslink.com/a/xyz",
    );
  });

  it("识别 xiaohongshu.com explore 链接", () => {
    const url = "https://www.xiaohongshu.com/explore/abc123";
    expect(extractXhsUrl(url)).toBe(url);
  });

  it("识别 xhs.cn 链接", () => {
    expect(extractXhsUrl("https://xhs.cn/abc")).toBe("https://xhs.cn/abc");
  });

  it("从夹带文字里只抽出链接本身", () => {
    expect(
      extractXhsUrl("看看这家店 https://www.xiaohongshu.com/explore/abc 很赞"),
    ).toBe("https://www.xiaohongshu.com/explore/abc");
  });

  it("没有链接 → null", () => {
    expect(extractXhsUrl("罗兰岗的炸酱面")).toBeNull();
  });

  it("非小红书链接 → null", () => {
    expect(extractXhsUrl("https://google.com/maps/place/xyz")).toBeNull();
  });
});

describe("stripXhsUrl", () => {
  it("去掉链接并 trim 两侧空白", () => {
    expect(
      stripXhsUrl("看看这家 https://www.xiaohongshu.com/explore/abc"),
    ).toBe("看看这家");
  });

  it("纯链接 → 空字符串", () => {
    expect(stripXhsUrl("http://xhslink.com/a/xyz")).toBe("");
  });

  it("没有链接 → 原文（trim 后）", () => {
    expect(stripXhsUrl("  罗兰岗的炸酱面  ")).toBe("罗兰岗的炸酱面");
  });
});
