"use client";

import { useEffect } from "react";

/**
 * 注册 minimal service worker。
 * 只在生产环境注册，避免 dev 时 Turbopack HMR 跟 SW 缓存打架。
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* swallow */
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);

  return null;
}
