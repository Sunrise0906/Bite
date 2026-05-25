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
          background: "#FAF5EF",
          color: "#1f2937",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif',
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 8 }}>🍵</div>
        <h1
          style={{
            margin: "0 0 12px",
            fontSize: 28,
            fontWeight: 600,
            color: "#1f2937",
          }}
        >
          应用初始化失败
        </h1>
        <p
          style={{
            margin: "0 0 16px",
            fontSize: 14,
            color: "#525252",
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
              background: "#f3f4f6",
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
            color: "white",
            background: "#D97757",
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
