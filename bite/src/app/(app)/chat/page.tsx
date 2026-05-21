export default function ChatPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-20">
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <ChatIcon />
        </div>
        <h1 className="heading-display text-2xl">AI 决策聊天</h1>
        <p className="mt-2 text-sm font-medium text-[var(--primary)]">
          Phase 3 · 即将上线
        </p>
        <p className="mt-6 max-w-md text-balance text-sm text-zinc-600">
          告诉 AI 你今晚和谁吃、想吃啥、预算多少——它会从你的 list 挑 2-3
          家，每家附上你之前写的笔记或 tag 作为理由。
        </p>
      </div>
    </main>
  );
}

function ChatIcon() {
  return (
    <svg
      aria-hidden="true"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1.1 3.5A8.96 8.96 0 0 1 21 12z" />
      <circle cx="9" cy="12" r="0.5" fill="currentColor" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
      <circle cx="15" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}
