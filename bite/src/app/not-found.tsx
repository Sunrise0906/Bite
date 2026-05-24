import Link from "next/link";

export const metadata = {
  title: "找不到页面 · Bite",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 text-6xl" aria-hidden>
        🍜
      </div>
      <h1 className="heading-display text-3xl text-[var(--text-strong)]">
        点错地方了
      </h1>
      <p className="mt-3 max-w-sm text-sm text-zinc-600">
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
