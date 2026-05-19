export default function ChatPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-20">
      <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
        <h1 className="text-2xl font-semibold tracking-tight">
          AI 决策聊天
        </h1>
        <p className="mt-2 text-sm text-zinc-500">Phase 3 即将上线</p>
        <p className="mt-6 max-w-md text-balance text-sm text-zinc-600 dark:text-zinc-400">
          告诉 AI 你今晚和谁吃、想吃啥、预算多少，它会从你的 list
          挑 2-3 家，每家附上你之前写的笔记 / tag 作为理由。
        </p>
      </div>
    </main>
  );
}
