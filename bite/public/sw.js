// Bite minimal service worker
// 1. 离线兜底：app shell 拉不到时返回缓存（不做激进 cache）
// 2. Web Push：展示通知 + 点击跳转（payload 见 lib/push/send.ts 的 PushPayload）

// 改这个名字会让浏览器丢弃旧缓存并重新预缓存 OFFLINE_URLS。
// UI 有明显改动时记得 bump（离线兜底的 /lists 快照否则会一直是旧版页面）。
// 注：这里的 v3 是缓存代次，跟已经删掉的「V1/V2 皮肤」无关。
const CACHE = "bite-shell-v3";
const OFFLINE_URLS = ["/lists", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // 只处理 GET HTML / asset；POST / SSE 直接放行
  if (req.method !== "GET") return;
  if (req.url.includes("/api/")) return;
  if (req.headers.get("accept")?.includes("text/event-stream")) return;

  event.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then((cached) => {
        if (cached) return cached;
        // 兜底：HTML 请求返回 /lists 缓存
        if (req.headers.get("accept")?.includes("text/html")) {
          return caches.match("/lists");
        }
        return new Response("Offline", { status: 503 });
      }),
    ),
  );
});

// ---- Web Push ----
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Bite", body: event.data?.text() ?? "" };
  }
  const title = payload.title || "Bite";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      data: { url: payload.url || "/lists" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/lists";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
