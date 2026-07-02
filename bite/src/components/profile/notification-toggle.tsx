"use client";

import { useEffect, useState, useTransition } from "react";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/lib/actions/push";

// 通知开关：订阅浏览器推送（收到推荐 / 共享清单新店 / 一起选匹配）。
// iOS Safari 需 16.4+ 且「添加到主屏幕」后才支持。

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = "loading" | "unsupported" | "denied" | "off" | "on";

export function NotificationToggle({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      if (
        !vapidPublicKey ||
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (alive) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (alive) setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (alive) setStatus(sub ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, [vapidPublicKey]);

  function enable() {
    setError(null);
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setStatus(perm === "denied" ? "denied" : "off");
          return;
        }
        // dev 下 PwaRegister 不注册 SW，这里按需注册
        const reg =
          (await navigator.serviceWorker.getRegistration()) ??
          (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!)
              .buffer as ArrayBuffer,
          }));
        const json = sub.toJSON();
        const r = await savePushSubscription({
          endpoint: sub.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
          },
        });
        if ("error" in r) {
          // 服务端没存上（比如 sql/0015 没跑）：把浏览器订阅退掉，
          // 否则刷新后 getSubscription 有值，开关会错误显示"已开启"
          await sub.unsubscribe().catch(() => {});
          setError(r.error);
          setStatus("off");
          return;
        }
        setStatus("on");
      } catch (e) {
        setError(e instanceof Error ? e.message : "开启失败");
      }
    });
  }

  function disable() {
    setError(null);
    start(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setStatus("off");
      } catch (e) {
        setError(e instanceof Error ? e.message : "关闭失败");
      }
    });
  }

  if (status === "loading") return null;

  if (status === "unsupported") {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        当前浏览器不支持推送通知（iPhone 需 iOS 16.4+ 并先「添加到主屏幕」再开）。
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        通知权限被浏览器拒绝了——去浏览器设置里允许本站通知后再回来开。
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-[var(--text-default)]">
          {status === "on" ? "推送通知已开启" : "接收推送通知"}
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            收到朋友推荐 / 共享清单加新店 / 一起选匹配时提醒你
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={status === "on" ? disable : enable}
          className={
            status === "on"
              ? "btn-secondary shrink-0 px-3 py-1.5 text-sm"
              : "btn-primary shrink-0 px-3 py-1.5 text-sm"
          }
        >
          {pending ? "…" : status === "on" ? "关闭" : "开启"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-[var(--danger-text)]">
          {error}
        </p>
      )}
    </div>
  );
}
