// V2 UI 版本开关。V1（现陶土风）是默认，V2 是新版融合设计，并存可切换。
// 版本存在 cookie `bite_ui`，服务端组件可读 → SSR 直接渲染对应版本，零闪烁。

import { cookies } from "next/headers";

export type UiVersion = "v1" | "v2";

export const UI_COOKIE = "bite_ui";

/** 服务端读当前 UI 版本。默认 V2（新版）；只有显式切到 V1 才回经典版。 */
export async function getUiVersion(): Promise<UiVersion> {
  const store = await cookies();
  return store.get(UI_COOKIE)?.value === "v1" ? "v1" : "v2";
}

// ============================ V2 主题 ============================
// 每套主题是完整的设计语言（配色 + 字体 + 圆角/阴影/描边形态），不只换色。
// 常量/类型在 lib/theme.ts（client-safe，不含 next/headers）；这里只放
// 服务端的 cookie 读取。

import { THEME_COOKIE, isBiteTheme, type BiteTheme } from "@/lib/theme";

export { THEME_COOKIE, isBiteTheme, THEMES, type BiteTheme } from "@/lib/theme";

/** 服务端读当前主题。默认陶土（即 V2 原样）。 */
export async function getTheme(): Promise<BiteTheme> {
  const store = await cookies();
  const v = store.get(THEME_COOKIE)?.value;
  return isBiteTheme(v) ? v : "terracotta";
}
