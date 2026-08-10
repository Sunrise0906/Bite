import { describe, it, expect } from "vitest";
import { menuUrl, menuSearchUrl, xhsSearchUrl } from "./menu-url";

describe("menuUrl — 优先直达点单页", () => {
  it("有 websiteUri 就直接用它（餐厅的这一项多半就是菜单本身）", () => {
    // MOri's 实测：Places 返回的正是 Toast 在线点单页
    const site = "https://order.toasttab.com/online/moris-6280-scholarship";
    expect(menuUrl("MOri's", "6280 Scholarship, Irvine", site)).toBe(site);
  });

  it("没有 websiteUri → 退回 Google 搜索（下策，但总比没有强）", () => {
    const u = menuUrl("凯悦轩", "Irvine", null);
    expect(u).toContain("google.com/search");
    expect(decodeURIComponent(u)).toContain("凯悦轩");
    expect(decodeURIComponent(u)).toContain("menu");
  });

  it("undefined 也走退路", () => {
    expect(menuUrl("某店", "某地")).toContain("google.com/search");
  });

  it("空串 / 纯空白的 websiteUri 不算数", () => {
    expect(menuUrl("某店", "某地", "")).toContain("google.com/search");
    expect(menuUrl("某店", "某地", "   ")).toContain("google.com/search");
  });

  it("非 http(s) 的脏值不当链接用 —— 防止 javascript: 之类进到 href", () => {
    expect(menuUrl("某店", "某地", "javascript:alert(1)")).toContain(
      "google.com/search",
    );
    expect(menuUrl("某店", "某地", "ftp://example.com")).toContain(
      "google.com/search",
    );
  });

  it("http 和 https 都接受", () => {
    expect(menuUrl("a", null, "http://x.com/menu")).toBe("http://x.com/menu");
    expect(menuUrl("a", null, "https://x.com/menu")).toBe("https://x.com/menu");
  });
});

describe("menuSearchUrl", () => {
  it("店名 + 地址 + menu 一起进查询串", () => {
    const q = decodeURIComponent(menuSearchUrl("海底捞", "Irvine Spectrum"));
    expect(q).toContain("海底捞");
    expect(q).toContain("Irvine Spectrum");
    expect(q).toContain("menu");
  });

  it("没地址也能用", () => {
    expect(decodeURIComponent(menuSearchUrl("海底捞", null))).toContain("海底捞");
  });

  it("特殊字符被正确编码（& 不能截断查询串）", () => {
    const u = menuSearchUrl("A&W", "Irvine");
    expect(u).not.toContain("q=A&W");
    expect(decodeURIComponent(u)).toContain("A&W");
  });
});

describe("xhsSearchUrl", () => {
  it("只用店名（小红书帖子几乎不含完整地址）", () => {
    expect(decodeURIComponent(xhsSearchUrl("凯悦轩"))).toContain("凯悦轩");
    expect(decodeURIComponent(xhsSearchUrl("凯悦轩"))).not.toContain("Irvine");
  });

  it("**不能**直接深链 xiaohongshu.com —— 网页版搜索要登录，关键词会被丢掉", () => {
    const u = xhsSearchUrl("凯悦轩");
    expect(u).not.toContain("xiaohongshu.com/search_result");
    expect(u).not.toContain("xiaohongshu.com/web/search");
  });

  it("走 Google 的 site: 限定搜索（免登录、任何浏览器都能用）", () => {
    const u = xhsSearchUrl("凯悦轩");
    expect(u).toContain("google.com/search");
    expect(decodeURIComponent(u)).toContain("site:xiaohongshu.com");
  });
});
