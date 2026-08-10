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

  // 回归：xhslink 有 .com 和 .cn 两套域名，最初只写了 .com。
  // 漏掉 .cn 的后果不是报错，而是那条链接被当成普通文本 —— 不去抓正文，
  // 只把被截断的分享口令喂给 LLM，店名抽成「（未知）」。
  it("识别 xhslink.cn 短链（App 分享口令里的实际形态）", () => {
    const url = "http://xhslink.cn/o/5Gq9E7EUnDH";
    expect(extractXhsUrl(url)).toBe(url);
  });

  it("从完整分享口令里挑出 xhslink.cn 链接", () => {
    const share =
      "三刷认证！好吃又好看的尔湾新晋日泰融合菜！ 从来没... http://xhslink.cn/o/5Gq9E7EUnDH 留住这段口令，去【小红书】瞅瞅笔记~";
    expect(extractXhsUrl(share)).toBe("http://xhslink.cn/o/5Gq9E7EUnDH");
  });

  it("stripXhsUrl 去掉 xhslink.cn 后留下正文", () => {
    const share =
      "三刷认证！尔湾新晋日泰融合菜 http://xhslink.cn/o/5Gq9E7EUnDH 留住这段口令";
    const rest = stripXhsUrl(share);
    expect(rest).not.toContain("xhslink.cn");
    expect(rest).toContain("日泰融合菜");
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
