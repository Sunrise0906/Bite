// V2 UI 版本开关。V1（现陶土风）是默认，V2 是新版融合设计，并存可切换。
// 版本存在 cookie `bite_ui`，服务端组件可读 → SSR 直接渲染对应版本，零闪烁。

import { cookies } from "next/headers";

export type UiVersion = "v1" | "v2";

export const UI_COOKIE = "bite_ui";

/** 服务端读当前 UI 版本（默认 v1，绝不影响没切的人） */
export async function getUiVersion(): Promise<UiVersion> {
  const store = await cookies();
  return store.get(UI_COOKIE)?.value === "v2" ? "v2" : "v1";
}
