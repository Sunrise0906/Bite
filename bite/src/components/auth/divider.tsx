export function AuthDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-400">
      <div className="h-px flex-1 bg-zinc-200" />
      <span>{children}</span>
      <div className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}
