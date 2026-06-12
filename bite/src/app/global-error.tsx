"use client";

import { useEffect } from "react";

/**
 * Root layout 也崩了时的最后兜底。必须自带 html/body 因为 replace 整个 layout。
 * 不能用任何依赖 layout 的 component / token，写死 inline 样式。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error (root layout crashed):", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          background: "#faf5ef",
          color: "#1f1a14",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif',
          textAlign: "center",
        }}
      >
        <svg
          aria-hidden="true"
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#c75b3a"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginBottom: 12 }}
        >
          <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
          <path d="M3 8h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" />
          <path d="M6.5 2v3M10 2v3M13.5 2v3" opacity="0.5" />
        </svg>
        <h1
          style={{
            margin: "0 0 12px",
            fontSize: 28,
            fontWeight: 600,
            color: "#1f1a14",
          }}
        >
          应用初始化失败
        </h1>
        <p
          style={{
            margin: "0 0 16px",
            fontSize: 14,
            color: "#4a4337",
            maxWidth: 420,
          }}
        >
          根布局加载时抛了错。这通常是环境变量 / Supabase 配置 / Next.js
          升级兼容性的问题。
        </p>
        {error.message && (
          <pre
            style={{
              marginTop: 8,
              padding: "8px 12px",
              background: "#f1eae0",
              color: "#4a4337",
              borderRadius: 6,
              fontSize: 12,
              maxWidth: "100%",
              overflowX: "auto",
              textAlign: "left",
            }}
          >
            {error.message}
          </pre>
        )}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: 24,
            padding: "8px 20px",
            fontSize: 14,
            color: "#ffffff",
            background: "#c75b3a",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          重试
        </button>
      </body>
    </html>
  );
}
