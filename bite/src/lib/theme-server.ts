// 服务端读主题 cookie。单独一个文件是因为它 import 了 next/headers，
// 而 lib/theme.ts 必须保持 client-safe（ThemePicker 是客户端组件要导入常量）。
//
// 主题在服务端解析 → layout 直接渲染出 .theme-* 类名 → 切主题零闪烁、无需客户端 provider。

import { cookies } from "next/headers";
import { THEME_COOKIE, isBiteTheme, type BiteTheme } from "@/lib/theme";

export { THEME_COOKIE, isBiteTheme, THEMES, type BiteTheme } from "@/lib/theme";

/** 默认陶土（基底主题，globals.css 的 :root 就是它）。 */
export async function getTheme(): Promise<BiteTheme> {
  const store = await cookies();
  const v = store.get(THEME_COOKIE)?.value;
  return isBiteTheme(v) ? v : "terracotta";
}
