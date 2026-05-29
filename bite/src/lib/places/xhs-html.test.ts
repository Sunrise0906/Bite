import { describe, it, expect } from "vitest";
import {
  cleanXhsTitle,
  decodeHtmlEntities,
  matchMeta,
  matchTitleTag,
  tryBuildFromOgMeta,
} from "./xhs-html";

describe("matchMeta", () => {
  it("匹配 property=", () => {
    const html = `<meta property="og:title" content="某店">`;
    expect(matchMeta(html, "og:title")).toBe("某店");
  });

  it("匹配 name=", () => {
    const html = `<meta name="og:description" content="美食">`;
    expect(matchMeta(html, "og:description")).toBe("美食");
  });

  it("匹配 itemprop=", () => {
    const html = `<meta itemprop="og:image" content="https://x/y.jpg">`;
    expect(matchMeta(html, "og:image")).toBe("https://x/y.jpg");
  });

  it("content 在 property 之前也能匹配（pattern2）", () => {
    const html = `<meta content="标题" property="og:title">`;
    expect(matchMeta(html, "og:title")).toBe("标题");
  });

  it("单引号属性可匹配", () => {
    const html = `<meta property='og:title' content='我'>`;
    expect(matchMeta(html, "og:title")).toBe("我");
  });

  it("不存在的 prop → null", () => {
    expect(matchMeta(`<meta property="x">`, "og:title")).toBeNull();
  });

  it("属性值含 HTML entity 自动解码", () => {
    const html = `<meta property="og:title" content="A &amp; B">`;
    expect(matchMeta(html, "og:title")).toBe("A & B");
  });
});

describe("matchTitleTag", () => {
  it("普通 <title>", () => {
    expect(matchTitleTag("<title>店名</title>")).toBe("店名");
  });

  it("title 带属性也能匹配", () => {
    expect(matchTitleTag("<title id=x>店</title>")).toBe("店");
  });

  it("trim 前后空白", () => {
    expect(matchTitleTag("<title>  店  </title>")).toBe("店");
  });

  it("无 title → null", () => {
    expect(matchTitleTag("<html></html>")).toBeNull();
  });
});

describe("cleanXhsTitle", () => {
  it("剥短后缀 '| 小红书'", () => {
    expect(cleanXhsTitle("某店 | 小红书")).toBe("某店");
  });

  it("剥长后缀 '- 小红书 你的生活兴趣社区'", () => {
    expect(cleanXhsTitle("某店 - 小红书 你的生活兴趣社区")).toBe("某店");
  });

  it("不含后缀原样返回（trim）", () => {
    expect(cleanXhsTitle("某店")).toBe("某店");
  });

  it("null → null", () => {
    expect(cleanXhsTitle(null)).toBeNull();
  });

  it("剥完只剩空白 → null", () => {
    expect(cleanXhsTitle(" | 小红书")).toBeNull();
  });
});

describe("decodeHtmlEntities", () => {
  it("解码常见命名实体", () => {
    expect(decodeHtmlEntities("a&amp;b")).toBe("a&b");
    expect(decodeHtmlEntities("&lt;x&gt;")).toBe("<x>");
    expect(decodeHtmlEntities("a&quot;b")).toBe('a"b');
    expect(decodeHtmlEntities("it&#39;s")).toBe("it's");
    expect(decodeHtmlEntities("it&apos;s")).toBe("it's");
  });

  it("解码数字实体（十进制）", () => {
    expect(decodeHtmlEntities("&#21704;")).toBe("哈");
  });

  it("解码十六进制实体大小写", () => {
    expect(decodeHtmlEntities("&#x54C8;")).toBe("哈");
    expect(decodeHtmlEntities("&#x54c8;")).toBe("哈");
  });

  it("嵌套实体：&amp;lt; 由于链式替换会被解到 < （锁定现行行为，非 bug）", () => {
    // &amp; → &，然后下一个 replace 里 &lt; → <。
    // 这是 .replace 链的副作用；如果以后改成单次扫描行为会变。
    expect(decodeHtmlEntities("&amp;lt;")).toBe("<");
  });
});

describe("tryBuildFromOgMeta", () => {
  const url = "https://xhslink.com/abc";

  it("仅 title 且 combinedText < 20 字 → null", () => {
    const html = `<meta property="og:title" content="店">`;
    expect(tryBuildFromOgMeta(url, html)).toBeNull();
  });

  it("title + desc 拼出 >=20 字 → 返回 og 对象", () => {
    const html = `
      <meta property="og:title" content="罗兰岗某家手工面馆">
      <meta property="og:description" content="周末刚去吃过味道不错">
    `;
    const out = tryBuildFromOgMeta(url, html);
    expect(out).not.toBeNull();
    expect(out!.extractionMode).toBe("og");
    expect(out!.title).toBe("罗兰岗某家手工面馆");
    expect(out!.body).toBe("周末刚去吃过味道不错");
    expect(out!.url).toBe(url);
  });

  it("ogImage 缺失 → images=[]", () => {
    const html = `
      <meta property="og:title" content="某家很不错的小餐厅店面">
      <meta property="og:description" content="特别推荐他们家的招牌主打">
    `;
    const out = tryBuildFromOgMeta(url, html);
    expect(out!.images).toEqual([]);
  });

  it("ogImage 存在 → images 含 URL", () => {
    const html = `
      <meta property="og:title" content="某家很不错的小餐厅店面">
      <meta property="og:description" content="特别推荐他们家的招牌主打">
      <meta property="og:image" content="https://cdn/cover.jpg">
    `;
    const out = tryBuildFromOgMeta(url, html);
    expect(out!.images).toEqual(["https://cdn/cover.jpg"]);
  });

  it("ogTitle 缺失，fallback 用 <title>", () => {
    const html = `
      <title>家庭式面馆推荐 | 小红书</title>
      <meta property="og:description" content="周末刚去吃过味道不错">
    `;
    const out = tryBuildFromOgMeta(url, html);
    expect(out!.title).toBe("家庭式面馆推荐");
  });
});
