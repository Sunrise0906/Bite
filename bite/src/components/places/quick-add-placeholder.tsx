// Phase 2 上线后会替换为可交互的 AI 智能输入框：
// 粘贴 XHS 链接 → 抓取解析；自由描述 → AI 提取；短文本 → Google Places autocomplete。

export function QuickAddPlaceholder() {
  return (
    <div className="relative">
      <div className="pointer-events-none flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40">
        <SparkleIcon />
        <span className="flex-1 truncate text-sm">
          粘贴小红书链接、写几句话、或搜店名…
        </span>
      </div>
      <span className="absolute -top-2 right-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Phase 2
      </span>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
    </svg>
  );
}
