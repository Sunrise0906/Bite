import { Suspense } from "react";
import { BottomNav } from "@/components/nav/bottom-nav";
import { ToastFlash } from "@/components/toast-flash";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense fallback={null}>
        <ToastFlash />
      </Suspense>
      <div className="flex flex-1 flex-col pb-16">{children}</div>
      <BottomNav />
    </div>
  );
}
