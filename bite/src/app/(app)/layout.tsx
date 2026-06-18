import { Suspense } from "react";
import { BottomNav } from "@/components/nav/bottom-nav";
import { ToastFlash } from "@/components/toast-flash";
import { requireUser } from "@/lib/supabase/server";
import { getUiVersion } from "@/lib/ui-version";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();
  const ui = await getUiVersion();

  return (
    <div
      className={`flex min-h-full flex-1 flex-col ${ui === "v2" ? "ui-v2" : ""}`}
    >
      <Suspense fallback={null}>
        <ToastFlash />
      </Suspense>
      <div className="flex flex-1 flex-col pb-16">{children}</div>
      <BottomNav />
    </div>
  );
}
