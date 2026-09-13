// POST /api/mobile/llm-settings/test —— 用表单当前值实测 provider（不保存）。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";
import { testLlmConnection } from "@/lib/actions/llm-settings";

export const runtime = "nodejs";

export const POST = mobileRoute(async ({ req }) => {
  const b = await readJsonBody<Record<string, unknown>>(req);
  const fd = new FormData();
  fd.set("provider", str(b.provider, 20));
  fd.set("api_key", str(b.api_key, 500));
  fd.set("base_url", str(b.base_url, 500));
  fd.set("chat_model", str(b.chat_model, 100));
  fd.set("extract_model", str(b.extract_model, 100));
  const r = await testLlmConnection(fd);
  if ("error" in r) return jsonError(r.error, 422);
  return jsonOk({ ok: true });
});
