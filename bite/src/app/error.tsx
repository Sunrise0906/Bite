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
      <div className="mb-4 text-6xl" aria-hidden>
        🍵
      </div>
      <h1 className="heading-display text-3xl text-[var(--text-strong)]">
        哎，出了点问题
      </h1>
      <p className="mt-3 max-w-sm text-sm text-zinc-600">
        这一步加载失败了——可能是网络抖动、数据库挂了一下、或者 AI provider
        临时不可用。
      </p>
      {error.message && (
        <pre className="mt-4 max-w-full overflow-x-auto rounded-md bg-[var(--surface-subtle)] px-3 py-2 text-left text-xs text-zinc-700">
          {error.message}
        </pre>
      )}
      {error.digest && (
        <p className="mt-2 text-[11px] text-zinc-400">trace · {error.digest}</p>
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
