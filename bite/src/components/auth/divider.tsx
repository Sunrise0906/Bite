export function AuthDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-[var(--text-faint)]">
      <div className="h-px flex-1 bg-[var(--border-subtle)]" />
      <span>{children}</span>
      <div className="h-px flex-1 bg-[var(--border-subtle)]" />
    </div>
  );
}
