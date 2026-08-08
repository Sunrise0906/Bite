import { Suspense } from "react";
import { BottomNav } from "@/components/nav/bottom-nav";
import { ToastFlash } from "@/components/toast-flash";
import { requireUser } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme-server";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();
  const theme = await getTheme();

  return (
    <div className={`flex min-h-full flex-1 flex-col ui-v2 theme-${theme}`}>
      <Suspense fallback={null}>
        <ToastFlash />
      </Suspense>
      {/* v2-shell：桌面端(≥1024px)导航变左侧栏时由 CSS 调整 padding */}
      <div className="v2-shell flex flex-1 flex-col pb-16">{children}</div>
      <BottomNav />
    </div>
  );
}
