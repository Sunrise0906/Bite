// 站内小红书搜索（方案 B）：走通用搜索 API（Serper.dev）限定 site:xiaohongshu.com。
//
// ⚠️⚠️ **这个功能实际上基本不可能有结果，别再花时间配 key 了**（2026-08-10 实测）。
//
// Serper 是 Google 搜索的 API 封装，而小红书的 robots.txt 明确禁止 Googlebot：
//     User-agent: Googlebot
//     Disallow: /
//     Allow: /worldcup26        ← 只放行一个世界杯专题
// 其他爬虫（Baidu / Bing / 360 / Sogou）至少还放行 /explore/，唯独 Googlebot 连
// 这个都不给；末尾的 User-agent: * 更是 Disallow: /。
// 所以 Google 索引里根本没有小红书的笔记可搜 —— site:xiaohongshu.com <店名>
// 在真实浏览器里返回 "did not match any documents"。
//
// 结论：这条路是死的，不是缺一把 key。真正能搜到东西的只有小红书 App 本身，
// 见 components/v2/xhs-search-button.tsx（复制店名 + xhsdiscover:// 深链）。
// 「粘贴分享链接导入」那条路是好的、也一直在用（lib/places/xhs.ts）。
//
// 代码留着不删：万一哪天小红书放开 robots，或换成允许抓取的搜索源，
// 这里改一个 query 就能复活。未配 SERPER_API_KEY → 返回 null，板块不渲染。

export type XhsSearchHit = {
  title: string;
  link: string;
  snippet: string;
};

const NOTE_LINK_RE = /xiaohongshu\.com\/(explore|discovery\/item)\//;

export async function searchXhsPosts(
  query: string,
): Promise<XhsSearchHit[] | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `site:xiaohongshu.com ${query}`,
        gl: "us",
        hl: "zh-cn",
        num: 10,
      }),
      signal: AbortSignal.timeout(6000),
      // 同一家店的搜索结果缓存 1 天，省免费额度
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    return (data.organic ?? [])
      .filter((r) => r.link && NOTE_LINK_RE.test(r.link))
      .slice(0, 5)
      .map((r) => ({
        title: (r.title ?? "").replace(/ - 小红书$/, "").trim() || "小红书帖子",
        link: r.link!,
        snippet: r.snippet ?? "",
      }));
  } catch {
    return [];
  }
}
