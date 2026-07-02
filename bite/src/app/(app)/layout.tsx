import { Suspense } from "react";
import { BottomNav } from "@/components/nav/bottom-nav";
import { ToastFlash } from "@/components/toast-flash";
import { requireUser } from "@/lib/supabase/server";
import { getTheme, getUiVersion } from "@/lib/ui-version";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();
  const ui = await getUiVersion();
  const theme = await getTheme();

  return (
    <div
      className={`flex min-h-full flex-1 flex-col ${
        ui === "v2" ? `ui-v2 theme-${theme}` : ""
      }`}
    >
      <Suspense fallback={null}>
        <ToastFlash />
      </Suspense>
      {/* v2-shell：桌面端(≥1024px)导航变左侧栏时由 CSS 调整 padding */}
      <div className={`flex flex-1 flex-col pb-16 ${ui === "v2" ? "v2-shell" : ""}`}>
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
