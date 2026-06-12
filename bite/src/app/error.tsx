"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * 路由内有未捕获 error 时渲染。
 * - Supabase 挂 / env 缺失 / 第三方 API 502 等情况兜底。
 * - reset() 重试当前 route segment。
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 后续可接 Sentry / 自家 logger；现在 console 兜底
    console.error("App error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <svg
        aria-hidden="true"
        width="60"
        height="60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-5 text-[var(--primary)]"
      >
        {/* 一杯冒着热气的茶 */}
        <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
        <path d="M3 8h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" />
        <path d="M6.5 2v3M10 2v3M13.5 2v3" opacity="0.5" />
      </svg>
      <h1 className="heading-display text-3xl text-[var(--text-strong)]">
        哎，出了点问题
      </h1>
      <p className="mt-3 max-w-sm text-sm text-[var(--text-muted)]">
        这一步加载失败了——可能是网络抖动、数据库挂了一下、或者 AI provider
        临时不可用。
      </p>
      {error.message && (
        <pre className="mt-4 max-w-full overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-left text-xs text-[var(--text-default)]">
          {error.message}
        </pre>
      )}
      {error.digest && (
        <p className="mt-2 text-[11px] text-[var(--text-faint)]">
          trace · {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="btn-primary px-4 py-2 text-sm"
        >
          重试
        </button>
        <Link href="/lists" className="btn-secondary px-4 py-2 text-sm">
          回 list 首页
        </Link>
      </div>
    </main>
  );
}
