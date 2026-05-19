import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

export default async function HomePage() {
  const user = await getUser();
  if (user) {
    redirect("/lists");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-5xl font-bold tracking-tight">Bite</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        餐厅记录 · AI 决策 · 朋友共享
      </p>
      <div className="mt-12 flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/login"
          className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-base font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          登录
        </Link>
        <Link
          href="/signup"
          className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
        >
          注册
        </Link>
      </div>
    </main>
  );
}
