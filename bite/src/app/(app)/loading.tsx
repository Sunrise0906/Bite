/**
 * (app) 路由组的全局加载骨架：server component 数据查询期间不再白屏。
 * 形状对齐 /lists 的「标题 + 输入条 + 卡片列表」，其他页过渡也不突兀。
 */
export default function AppLoading() {
  return (
    <main
      className="mx-auto w-full max-w-2xl animate-pulse px-5 py-7 sm:py-12"
      aria-label="加载中"
      aria-busy="true"
    >
      <div className="h-9 w-2/3 rounded-lg bg-[var(--surface-muted)]" />
      <div className="mt-3 h-4 w-2/5 rounded bg-[var(--surface-muted)]" />

      <div className="mt-7 h-12 rounded-[0.875rem] bg-[var(--surface-muted)]" />

      <div className="mt-8 space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-[1.125rem] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5"
          >
            <div className="h-4 w-1/2 rounded bg-[var(--surface-muted)]" />
            <div className="mt-3 h-3 w-1/3 rounded bg-[var(--surface-muted)]" />
          </div>
        ))}
      </div>
    </main>
  );
}
