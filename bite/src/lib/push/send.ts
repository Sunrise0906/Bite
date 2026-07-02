// Web Push 发送（VAPID）。三个前置条件缺任何一个都静默跳过（跟 email/send.ts 同哲学）：
//   1. VAPID_PRIVATE_KEY + NEXT_PUBLIC_VAPID_PUBLIC_KEY（推送签名密钥）
//   2. SUPABASE_SERVICE_ROLE_KEY（跨用户读接收者的订阅，RLS 只许本人读自己的）
//   3. 接收者真的开过通知（push_subscriptions 有行，sql/0015）
// 发送失败 404/410（订阅失效）会顺手清掉那行。

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPayload = {
  title: string;
  body?: string;
  /** 点击通知打开的站内路径，如 /recommendations */
  url?: string;
};

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    pub,
    priv,
  );
  vapidReady = true;
  return true;
}

/**
 * 给一批用户的所有设备发通知。fire-and-forget：任何失败只打日志不抛。
 * 调用方无需 await 结果语义（但 server action 里请 await，防止 serverless 提前冻结）。
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  try {
    const targets = [...new Set(userIds)].filter(Boolean);
    if (targets.length === 0 || !ensureVapid()) return;
    const admin = createAdminClient();
    if (!admin) return;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .in("user_id", targets);
    if (!subs || subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            body,
            // timeout：推送服务挂起时不能拖住调用它的 server action
            { TTL: 60 * 60 * 24, timeout: 5000 },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // 订阅已失效（换浏览器/清数据），清理
            await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          } else {
            console.warn("[push] send failed:", status ?? err);
          }
        }
      }),
    );
  } catch (err) {
    console.warn("[push] unexpected:", err);
  }
}
