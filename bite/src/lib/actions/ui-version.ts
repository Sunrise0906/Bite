"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { UI_COOKIE, type UiVersion } from "@/lib/ui-version";

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
