import Link from "next/link";

export const metadata = {
  title: "找不到页面 · Bite",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <svg
        aria-hidden="true"
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-5 text-[var(--primary)]"
      >
        {/* 一碗面：碗 + 筷子 + 热气 */}
        <path d="M10 32h44c0 9-5.5 16-13 19l-1 5H24l-1-5c-7.5-3-13-10-13-19z" />
        <path d="M28 32 41 9M34 32 49 12" />
        <path d="M18 32c4-3 9-3 13 0" opacity="0.55" strokeDasharray="2 3" />
        <path d="M19 16c-1.5 2 1.5 3.5 0 5.5" opacity="0.45" />
      </svg>
      <h1 className="heading-display text-3xl text-[var(--text-strong)]">
        点错地方了
      </h1>
      <p className="mt-3 max-w-sm text-sm text-[var(--text-muted)]">
        这个链接对应的页面不存在——可能 list 被删了、邀请过期了，
        或者你点的是个老链接。
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/lists" className="btn-primary px-4 py-2 text-sm">
          回到我的 list
        </Link>
        <Link href="/chat" className="btn-secondary px-4 py-2 text-sm">
          去聊天
        </Link>
      </div>
    </main>
  );
}
