// 外部搜索直达链接（零后端、零风控：跳到用户自己登录的平台看完整内容）

/**
 * 一键看菜单。
 *
 * 优先用 Google Places 的 websiteUri —— 餐厅的这一项**通常直接就是在线点单/菜单页**
 * （Toast、Square 等）。实测 MOri's：
 *   websiteUri = https://order.toasttab.com/online/moris-6280-scholarship
 * 正是菜单本身。
 *
 * 没有 websiteUri（店没登记官网、或还没被 Google 丰富过）才退回原来的 Google 搜索 ——
 * 那会落到一屏 Grubhub / UberEats / Postmates 的结果里，用户还得自己找，是下策。
 */
export function menuUrl(
  name: string,
  address?: string | null,
  websiteUri?: string | null,
): string {
  const site = websiteUri?.trim();
  if (site && /^https?:\/\//i.test(site)) return site;
  return menuSearchUrl(name, address);
}

/** 退路：拿「店名 + 地址 + menu」开 Google 搜索。 */
export function menuSearchUrl(name: string, address?: string | null): string {
  const q = [name, address?.trim(), "menu 菜单"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// ⚠️ 这里**故意没有** xhsSearchUrl —— 小红书没有任何可用的网页搜索 URL：
//   · /search_result?keyword=X     → 「你访问的页面不见了」
//   · /web/search/result?keyword=X → 302 到首页登录墙，关键词被丢掉
//   · Google 的 site:xiaohongshu.com → robots.txt 对 Googlebot 全站 Disallow，索引为空
// 真能搜到东西的只有小红书 App，见 components/v2/xhs-search-button.tsx。
