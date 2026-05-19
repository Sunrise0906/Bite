import { signOut } from "@/lib/actions/auth";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Profile } from "@/lib/db/types";

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  const displayName =
    profile?.name ?? user.email?.split("@")[0] ?? "未命名用户";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">我的</h1>
      </header>

      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-4">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="h-14 w-14 rounded-full"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-xl font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium">{displayName}</p>
            <p className="truncate text-sm text-zinc-500">{user.email}</p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          即将上线
        </h2>
        <ul className="space-y-2 text-sm text-zinc-500">
          <li>· Phase 3：AI provider 设置（自带 OpenAI / DeepSeek / Qwen key）</li>
          <li>· Phase 5：邀请朋友 / 接受推荐</li>
        </ul>
      </section>

      <section className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            退出登录
          </button>
        </form>
      </section>
    </main>
  );
}
