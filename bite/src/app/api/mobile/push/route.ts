// /api/mobile/push —— iOS 设备的 APNs token 登记（sql/0029）。
//   POST   { token, environment: "sandbox" | "production" } → 登记到当前用户
//   DELETE { token } → 注销（退出登录时调）
// 发送在 lib/push/apns.ts，由 sendPushToUsers 统一触发（推荐 / 邀请 / 新店 / 匹配 / 留言）。

import {
  jsonError,
  jsonOk,
  mobileRoute,
  readJsonBody,
  str,
} from "@/lib/supabase/mobile-auth";

export const runtime = "nodejs";

const MISSING_TABLE = "42P01";
const MISSING_FN = "42883";

export const POST = mobileRoute(async ({ req, scope }) => {
  const b = await readJsonBody<Record<string, unknown>>(req);
  const token = str(b.token, 512).toLowerCase();
  if (!/^[0-9a-f]{32,}$/.test(token)) return jsonError("无效的设备 token");
  const environment =
    str(b.environment, 20) === "production" ? "production" : "sandbox";

  // 同一台设备换账号登录时 token 不变：函数内部先删旧归属再插入（见 sql/0029）
  const { error } = await scope.supabase.rpc("register_device_token", {
    p_token: token,
    p_platform: "ios",
    p_environment: environment,
  });
  if (error) {
    if (error.code === MISSING_TABLE || error.code === MISSING_FN) {
      return jsonError("推送还没启用（数据库还没跑 sql/0029）", 501);
    }
    return jsonError(`登记失败：${error.message}`, 500);
  }
  return jsonOk({ ok: true });
});

export const DELETE = mobileRoute(async ({ req, scope }) => {
  const b = await readJsonBody<Record<string, unknown>>(req);
  const token = str(b.token, 512).toLowerCase();
  if (!token) return jsonError("缺少 token");
  const { error } = await scope.supabase
    .from("device_tokens")
    .delete()
    .eq("token", token)
    .eq("user_id", scope.user.id);
  if (error && error.code !== MISSING_TABLE) {
    return jsonError(`注销失败：${error.message}`, 500);
  }
  return jsonOk({ ok: true });
});
