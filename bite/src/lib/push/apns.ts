// APNs（Apple Push Notification service）发送 —— iOS App 的推送。
//
// 零依赖：token-based 鉴权的 JWT 用 node:crypto 的 ES256 签，请求走 node:http2
// （APNs 只接受 HTTP/2）。四个前置条件缺任何一个都静默跳过（跟 web push 同哲学）：
//   1. APNS_TEAM_ID + APNS_KEY_ID + APNS_PRIVATE_KEY（Apple Developer → Keys 建的 .p8）
//   2. APNS_BUNDLE_ID（App 的 bundle id，= apns-topic）
//   3. SUPABASE_SERVICE_ROLE_KEY（跨用户读接收者的 device_tokens）
//   4. 接收者真的在 App 里开过通知（device_tokens 有行，sql/0029）
// Apple 回 410 / BadDeviceToken / Unregistered 时顺手删掉那行。
//
// payload 沿用 Web Push 的 { title, body, url }：url 是站内路径，App 会映射到对应页面。

import http2 from "node:http2";
import { createHash, createPrivateKey, sign, type KeyObject } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushPayload } from "./send";

type ApnsEnv = "sandbox" | "production";

const HOSTS: Record<ApnsEnv, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

type ApnsConfig = {
  teamId: string;
  keyId: string;
  privateKey: KeyObject;
  bundleId: string;
};

let cachedConfig: ApnsConfig | null | undefined;

function loadConfig(): ApnsConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim();
  // .p8 内容常以「\n」转义后塞进一行 env，这里还原
  const pem = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!teamId || !keyId || !bundleId || !pem) {
    cachedConfig = null;
    return null;
  }
  try {
    cachedConfig = {
      teamId,
      keyId,
      bundleId,
      privateKey: createPrivateKey(pem),
    };
  } catch (err) {
    console.warn("[apns] APNS_PRIVATE_KEY 解析失败:", err);
    cachedConfig = null;
  }
  return cachedConfig;
}

export function isApnsConfigured(): boolean {
  return loadConfig() !== null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * ES256 JWT：header {alg, kid} + claims {iss, iat}。纯函数化以便单测；
 * 生产里由 cachedJwt 缓存 50 分钟（Apple 要求 20-60 分钟内换一次）。
 */
export function buildApnsJwt(
  cfg: { teamId: string; keyId: string; privateKey: KeyObject },
  issuedAtSec: number = Math.floor(Date.now() / 1000),
): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claims = base64url(JSON.stringify({ iss: cfg.teamId, iat: issuedAtSec }));
  const data = `${header}.${claims}`;
  const sig = sign("sha256", Buffer.from(data), {
    key: cfg.privateKey,
    // APNs 要的是 JWS 的 r||s 原始签名，不是 DER
    dsaEncoding: "ieee-p1363",
  });
  return `${data}.${base64url(sig)}`;
}

let cachedJwt: { token: string; issuedAt: number } | null = null;
const JWT_TTL_SEC = 50 * 60;

function currentJwt(cfg: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < JWT_TTL_SEC) return cachedJwt.token;
  cachedJwt = { token: buildApnsJwt(cfg, now), issuedAt: now };
  return cachedJwt.token;
}

export type ApnsSendResult =
  | { ok: true }
  | { ok: false; status: number; reason: string };

/** 发一条到一台设备。不抛：网络错也归成 ok:false。 */
export function sendApns(
  cfg: ApnsConfig,
  deviceToken: string,
  environment: ApnsEnv,
  payload: PushPayload,
  timeoutMs = 5000,
): Promise<ApnsSendResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: ApnsSendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.close();
      resolve(r);
    };

    const client = http2.connect(HOSTS[environment]);
    const timer = setTimeout(
      () => done({ ok: false, status: 0, reason: "timeout" }),
      timeoutMs,
    );
    client.on("error", (err) =>
      done({ ok: false, status: 0, reason: String(err) }),
    );

    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body ?? "" },
        sound: "default",
      },
      // 站内路径，App 侧 DeepLink 会把 /lists/<id>/places/<pid> 这类路径映射到页面
      url: payload.url ?? "/lists",
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${currentJwt(cfg)}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 60 * 60 * 24),
      "apns-collapse-id": createHash("sha1")
        .update(payload.url ?? payload.title)
        .digest("hex")
        .slice(0, 32),
      "content-type": "application/json",
    });

    let status = 0;
    let text = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      text += chunk;
    });
    req.on("end", () => {
      if (status === 200) return done({ ok: true });
      let reason = "";
      try {
        reason = String((JSON.parse(text) as { reason?: string }).reason ?? "");
      } catch {
        reason = text.slice(0, 120);
      }
      done({ ok: false, status, reason });
    });
    req.on("error", (err) =>
      done({ ok: false, status: 0, reason: String(err) }),
    );
    req.end(body);
  });
}

/** 这些原因说明 token 永久失效，删掉那行（同 web push 对 404/410 的处理） */
const DEAD_TOKEN_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
  "ExpiredToken",
]);

/**
 * 给一批用户的所有 iOS 设备发通知。未配置 APNs 或没人登记设备时静默返回。
 * admin 必须是 service-role client（要读别人的 device_tokens）。
 */
export async function sendApnsToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  const cfg = loadConfig();
  if (!cfg || userIds.length === 0) return;

  const { data: rows, error } = await admin
    .from("device_tokens")
    .select("token, environment")
    .in("user_id", userIds);
  // 42P01 = 表还没建（sql/0029 没跑）—— 当没这个功能
  if (error || !rows || rows.length === 0) return;

  await Promise.all(
    (rows as Array<{ token: string; environment: string }>).map(async (r) => {
      const env: ApnsEnv = r.environment === "sandbox" ? "sandbox" : "production";
      const result = await sendApns(cfg, r.token, env, payload);
      if (result.ok) return;
      if (result.status === 410 || DEAD_TOKEN_REASONS.has(result.reason)) {
        await admin.from("device_tokens").delete().eq("token", r.token);
      } else {
        console.warn(`[apns] send failed: ${result.status} ${result.reason}`);
      }
    }),
  );
}
