import { Suspense } from "react";
import { BottomNav } from "@/components/nav/bottom-nav";
import { ToastFlash } from "@/components/toast-flash";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();

  // ui-v2 / theme-* 由根 layout 挂在 <html> 上（见 app/layout.tsx 的注释），
  // 这里不要重复挂——挂在内层 div 上会让 globals.css :root 的派生 token 取不到主题值。
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense fallback={null}>
        <ToastFlash />
      </Suspense>
      {/* v2-shell：桌面端(≥1024px)导航变左侧栏时由 CSS 调整 padding */}
      <div className="v2-shell flex flex-1 flex-col pb-16">{children}</div>
      <BottomNav />
    </div>
  );
}
