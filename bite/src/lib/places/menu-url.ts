// 一键看菜单：用「店名 + 地址 + menu」做 Google 搜索。
// Google 对多数美国餐厅会直接 surface 菜单/菜品照片/外卖平台菜单，
// 对所有店立即可用，不依赖店有没有官网、也不需要额外数据。

export function menuSearchUrl(name: string, address?: string | null): string {
  const q = [name, address?.trim(), "menu 菜单"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
