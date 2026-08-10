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

/**
 * 小红书搜这家。
 *
 * ⚠️ **不能**直接深链到 xiaohongshu.com 的搜索页。实测（2026-08）：
 *   · /search_result?keyword=X        → 「你访问的页面不见了」
 *   · /web/search/result?keyword=X    → 302 到首页 + 登录墙，**关键词被丢掉**
 * 小红书网页版搜索现在要求登录，未登录点进去只会看到一个登录弹窗，
 * 用户会以为「根本没搜索」——因为确实没有。
 *
 * 改走 Google 的 site: 限定搜索：任何浏览器都能用、不需要登录、结果就是小红书帖子。
 * 这跟服务端 searchXhsPosts()（Serper API）用的是同一个思路，只是那条能把结果
 * 直接渲染在 app 内 —— 配了 SERPER_API_KEY 就会出现「小红书 · 关于这家店」板块，
 * 那才是不用离开 app 的版本。
 *
 * 只用店名——XHS 帖子几乎不含完整地址，带地址反而搜不到。
 */
export function xhsSearchUrl(name: string): string {
  const q = `site:xiaohongshu.com ${name}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
