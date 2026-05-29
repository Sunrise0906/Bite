// XHS share 链接的 OG meta 退路解析。
// 当 __INITIAL_STATE__ 拿不到（账号关闭浏览 / 反爬）走这里——
// 只能拿到标题 + 摘要 + 封面图，但比完全失败强。
//
// 抽这里是为了 vitest 覆盖：正则密、HTML entity 兜底分支多，
// 加上后续要微调正则时有回归保护。

import type { XhsScrape } from "./xhs";

export function tryBuildFromOgMeta(
  url: string,
  html: string,
): XhsScrape | null {
  const ogTitle = matchMeta(html, "og:title");
  const ogDesc = matchMeta(html, "og:description");
  const ogImage = matchMeta(html, "og:image");
  const titleTag = matchTitleTag(html);

  const title = cleanXhsTitle(ogTitle ?? titleTag);
  const body = ogDesc?.trim() || null;
  if (!title && !body) return null;

  const combinedText = [
    title ? `帖子标题：${title}` : null,
    body ? `帖子摘要：${body}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (combinedText.length < 20) return null;

  return {
    url,
    title,
    body,
    tags: [],
    authorName: null,
    ipLocation: null,
    comments: [],
    images: ogImage?.trim() ? [ogImage.trim()] : [],
    combinedText,
    extractionMode: "og",
  };
}

export function matchMeta(html: string, prop: string): string | null {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern1 = new RegExp(
    `<meta[^>]+?(?:property|name|itemprop)=["']${escaped}["'][^>]+?content=["']([^"']*)["']`,
    "i",
  );
  const pattern2 = new RegExp(
    `<meta[^>]+?content=["']([^"']*)["'][^>]+?(?:property|name|itemprop)=["']${escaped}["']`,
    "i",
  );
  const m = html.match(pattern1) ?? html.match(pattern2);
  return m ? decodeHtmlEntities(m[1]) : null;
}

export function matchTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : null;
}

export function cleanXhsTitle(s: string | null): string | null {
  if (!s) return null;
  return (
    s
      .replace(/[\s|\-—_]+小红书[\s|\-—_]*(你的生活兴趣社区)?\s*$/i, "")
      .trim() || null
  );
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}
