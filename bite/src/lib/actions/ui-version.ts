"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  UI_COOKIE,
  THEME_COOKIE,
  isBiteTheme,
  type BiteTheme,
  type UiVersion,
} from "@/lib/ui-version";

/** 切换 UI 版本（写 cookie）。客户端切换后 router.refresh 即可全站换版。 */
export async function setUiVersion(v: UiVersion): Promise<{ ok: true }> {
  const store = await cookies();
  store.set(UI_COOKIE, v === "v2" ? "v2" : "v1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 年
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 切换 V2 主题（写 cookie）。非法值一律回落陶土。 */
export async function setTheme(t: BiteTheme): Promise<{ ok: true }> {
  const store = await cookies();
  store.set(THEME_COOKIE, isBiteTheme(t) ? t : "terracotta", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
