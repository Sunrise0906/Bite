// Phase 2 上线后会替换为可交互的 AI 智能输入框：
// 粘贴 XHS 链接 → 抓取解析；自由描述 → AI 提取；短文本 → Google Places autocomplete。

export function QuickAddPlaceholder() {
  return (
    <div className="relative">
      <div className="pointer-events-none flex items-center gap-2.5 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]/60 px-4 py-3.5 text-zinc-500">
        <SparkleIcon />
        <span className="flex-1 truncate text-sm">
          粘贴小红书链接、写几句话、或搜店名…
        </span>
      </div>
      <span className="absolute -top-2 right-3 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-soft-text)]">
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
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--primary)]"
    >
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M18 17l.75 2.25L21 20l-2.25.75L18 23l-.75-2.25L15 20l2.25-.75z" />
      <path d="M5 16l.5 1.5L7 18l-1.5.5L5 20l-.5-1.5L3 18l1.5-.5z" />
    </svg>
  );
}
