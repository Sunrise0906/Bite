import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

export default async function HomePage() {
  const user = await getUser();
  if (user) {
    redirect("/lists");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="brand-mark text-7xl text-[var(--text-strong)]">Bite</h1>
        <p className="mt-5 text-base text-zinc-600">
          餐厅记录 · AI 决策 · 朋友共享
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          不再忘记朋友推荐的店，不再纠结今晚吃哪
        </p>
        <div className="mt-14 flex w-full flex-col gap-3">
          <Link href="/login" className="btn-primary py-3.5 text-base">
            登录
          </Link>
          <Link href="/signup" className="btn-secondary py-3.5 text-base">
            创建账号
          </Link>
        </div>
      </div>
    </main>
  );
}
