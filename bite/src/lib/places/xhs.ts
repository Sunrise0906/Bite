// 小红书 share 链接抓取。
//
// 策略：服务端 fetch HTML，优先从内嵌的 window.__INITIAL_STATE__ JSON
// 抽取完整正文 + 标签 + 评论；如果该字段不存在（账号关闭浏览 / 反爬），
// 退回 OG meta tags（og:title + og:description）；都失败时由调用方兜底。
//
// XHS 在 share 链接 HTML 里塞 __INITIAL_STATE__ 是给客户端 hydrate
// 用的，我们读它属于读公开渲染数据。评论 list 在 HTML 里只有第一页
// （后续靠 X-S 签名的 API，反爬严格，v1 不做）。

const XHS_URL_RE =
  /https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com|xhs\.cn)\/[^\s<>"']+/i;

const NOTE_ID_FROM_PATH_RE = /\/(?:item|explore|discovery\/item)\/([a-z0-9]+)/i;

const FETCH_TIMEOUT_MS = 10000;

const SCRAPE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

export type XhsComment = {
  author: string;
  content: string;
  replies: Array<{ author: string; content: string }>;
  likes?: number;
};

export type XhsScrape = {
  url: string;
  title: string | null;
  body: string | null;
  tags: string[];
  authorName: string | null;
  ipLocation: string | null;
  comments: XhsComment[];
  // 帖子里所有图片 URL（第一张通常是封面）。OG-only 路径可能只有 1 张
  images: string[];
  // 拼好喂给 LLM 的文本
  combinedText: string;
  // 来自哪个数据源：rich = __INITIAL_STATE__, og = OG meta only
  extractionMode: "rich" | "og";
};

export function extractXhsUrl(input: string): string | null {
  const m = input.match(XHS_URL_RE);
  return m ? m[0] : null;
}

export function stripXhsUrl(input: string): string {
  return input.replace(XHS_URL_RE, "").trim();
}

export async function scrapeXhsUrl(url: string): Promise<XhsScrape> {
  if (!XHS_URL_RE.test(url)) throw new Error("不是小红书链接");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      headers: SCRAPE_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("抓取超时（>10s），XHS 可能在限流");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  // 检测是否被弹到 404 / 限制页
  if (
    html.includes("当前笔记暂时无法浏览") ||
    /\/404\?/.test(html.slice(0, 4000))
  ) {
    throw new Error(
      "XHS 把链接挡了（可能 xsec_token 过期或登录态校验失败）",
    );
  }

  // 1️⃣ 优先解析 __INITIAL_STATE__
  const rich = tryBuildFromInitialState(url, html);
  if (rich) return rich;

  // 2️⃣ 退回 OG meta
  const og = tryBuildFromOgMeta(url, html);
  if (og) return og;

  throw new Error("抓到的内容不足，可能页面结构变了");
}

// ============================ 富抽取（__INITIAL_STATE__）============================

type AnyRecord = Record<string, unknown>;

function tryBuildFromInitialState(
  url: string,
  html: string,
): XhsScrape | null {
  const m = html.match(
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/,
  );
  if (!m) return null;

  // XHS 把 JS 的 undefined 直接序列化进了"JSON"，得先洗
  const cleaned = m[1]
    .replace(/:\s*undefined/g, ":null")
    .replace(/,undefined/g, ",null")
    .replace(/\[undefined/g, "[null");

  let state: AnyRecord;
  try {
    state = JSON.parse(cleaned) as AnyRecord;
  } catch {
    return null;
  }

  const note = (state.note as AnyRecord) ?? null;
  const map = (note?.noteDetailMap as Record<string, AnyRecord>) ?? null;
  if (!map) return null;

  // 优先从 URL 提 noteId 命中
  const pathMatch = url.match(NOTE_ID_FROM_PATH_RE);
  const targetId = pathMatch?.[1];
  const detailKeys = Object.keys(map);
  const detail =
    (targetId && map[targetId]) ||
    (detailKeys.length > 0 ? map[detailKeys[0]] : null);
  if (!detail) return null;

  const noteData = (detail.note as AnyRecord) ?? null;
  if (!noteData) return null;

  const title =
    typeof noteData.title === "string" ? noteData.title.trim() || null : null;
  const body =
    typeof noteData.desc === "string" ? noteData.desc.trim() || null : null;
  const tagsRaw = (noteData.tagList as Array<AnyRecord> | undefined) ?? [];
  const tags = tagsRaw
    .map((t) => (typeof t === "string" ? t : (t?.name as string)))
    .filter((s): s is string => Boolean(s));
  const user = (noteData.user as AnyRecord | undefined) ?? null;
  const authorName =
    user && typeof user.nickname === "string" ? user.nickname : null;
  const ipLocation =
    typeof noteData.ipLocation === "string" ? noteData.ipLocation : null;
  const imageList = (noteData.imageList as Array<AnyRecord> | undefined) ?? [];
  const images = imageList
    .map((img) => {
      const u =
        (img?.urlDefault as string | undefined) ??
        (img?.url as string | undefined);
      return typeof u === "string" && u ? u : null;
    })
    .filter((u): u is string => Boolean(u));

  // 评论
  const commentsObj = (detail.comments as AnyRecord | undefined) ?? null;
  const commentList =
    (commentsObj?.list as Array<AnyRecord> | undefined) ?? [];
  const comments: XhsComment[] = commentList
    .slice(0, 12)
    .map((c) => {
      const cUser = (c.userInfo as AnyRecord | undefined) ?? null;
      const author =
        (cUser?.nickname as string | undefined) ?? "匿名";
      const content =
        typeof c.content === "string" ? c.content.trim() : "";
      const subList = (c.subComments as Array<AnyRecord> | undefined) ?? [];
      const replies = subList.slice(0, 4).map((sc) => {
        const scUser = (sc.userInfo as AnyRecord | undefined) ?? null;
        return {
          author: (scUser?.nickname as string | undefined) ?? "匿名",
          content:
            typeof sc.content === "string" ? sc.content.trim() : "",
        };
      });
      return {
        author,
        content,
        replies: replies.filter((r) => r.content),
        likes:
          typeof c.likeCount === "number"
            ? c.likeCount
            : typeof c.likeCount === "string"
              ? Number(c.likeCount) || undefined
              : undefined,
      };
    })
    .filter((c) => c.content);

  if (!title && !body) return null;

  const combinedText = buildLlmText({
    title,
    body,
    tags,
    authorName,
    ipLocation,
    comments,
  });

  return {
    url,
    title,
    body,
    tags,
    authorName,
    ipLocation,
    comments,
    images,
    combinedText,
    extractionMode: "rich",
  };
}

function buildLlmText(input: {
  title: string | null;
  body: string | null;
  tags: string[];
  authorName: string | null;
  ipLocation: string | null;
  comments: XhsComment[];
}): string {
  const parts: string[] = [];
  if (input.title) parts.push(`帖子标题：${input.title}`);
  if (input.authorName) {
    parts.push(
      `博主：@${input.authorName}` +
        (input.ipLocation ? `（IP 属地：${input.ipLocation}）` : ""),
    );
  }
  if (input.tags.length) {
    parts.push(`帖子标签：${input.tags.join("、")}`);
  }
  if (input.body) {
    parts.push(`帖子正文：\n${input.body}`);
  }
  if (input.comments.length) {
    parts.push("\n【评论区前 12 条】（用来评估真实口碑，注意 vs 帖子是否一致）");
    input.comments.forEach((c, i) => {
      const likeTxt = c.likes ? `（👍${c.likes}）` : "";
      parts.push(`#${i + 1} @${c.author}${likeTxt}：${c.content}`);
      c.replies.forEach((r) =>
        parts.push(`    ↳ @${r.author}：${r.content}`),
      );
    });
  }
  return parts.join("\n");
}

// ============================ OG meta 退路 ============================

function tryBuildFromOgMeta(url: string, html: string): XhsScrape | null {
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

function matchMeta(html: string, prop: string): string | null {
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

function matchTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : null;
}

function cleanXhsTitle(s: string | null): string | null {
  if (!s) return null;
  return (
    s
      .replace(/[\s|\-—_]+小红书[\s|\-—_]*(你的生活兴趣社区)?\s*$/i, "")
      .trim() || null
  );
}

function decodeHtmlEntities(s: string): string {
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
