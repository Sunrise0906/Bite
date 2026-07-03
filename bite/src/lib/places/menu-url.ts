// 外部搜索直达链接（零后端、零风控：跳到用户自己登录的平台看完整内容）

// 一键看菜单：用「店名 + 地址 + menu」做 Google 搜索。
// Google 对多数美国餐厅会直接 surface 菜单/菜品照片/外卖平台菜单，
// 对所有店立即可用，不依赖店有没有官网、也不需要额外数据。
export function menuSearchUrl(name: string, address?: string | null): string {
  const q = [name, address?.trim(), "menu 菜单"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// 小红书搜这家：深链到 XHS 搜索页（手机上会唤起小红书 App，关键词已填好）。
// 只用店名——XHS 帖子几乎不含完整地址，带地址反而搜不到。
export function xhsSearchUrl(name: string): string {
  return `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(name)}`;
}
