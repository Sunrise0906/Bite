import { BottomNav } from "@/components/nav/bottom-nav";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex flex-1 flex-col pb-16">{children}</div>
      <BottomNav />
    </div>
  );
}
