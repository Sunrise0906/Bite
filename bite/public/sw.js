// Bite minimal service worker
// 仅离线兜底：app shell 拉不到时返回缓存。
// 不做激进 cache（Next.js 已经有自己的缓存策略）。

const CACHE = "bite-v1";
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
