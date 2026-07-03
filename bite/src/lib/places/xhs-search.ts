// 站内小红书搜索（方案 B）：不爬 XHS 搜索页（登录墙+风控），走通用搜索 API
// （Serper.dev，免费额度 2500 次/月）限定 site:xiaohongshu.com。
// 未配 SERPER_API_KEY → 返回 null，调用方直接不渲染板块（功能静默隐藏）。

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
