"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { THEME_COOKIE, isBiteTheme, type BiteTheme } from "@/lib/theme";

/** 切换主题（写 cookie）。非法值一律回落陶土。 */
export async function setTheme(t: BiteTheme): Promise<{ ok: true }> {
  const store = await cookies();
  store.set(THEME_COOKIE, isBiteTheme(t) ? t : "terracotta", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 年
    sameSite: "lax",
  });
  // layout 上挂着 theme-* 类名，所以要整棵树失效
  revalidatePath("/", "layout");
  return { ok: true };
}
