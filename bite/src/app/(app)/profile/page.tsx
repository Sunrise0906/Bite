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
        <h1 className="heading-display text-3xl sm:text-4xl">我的</h1>
      </header>

      <section className="card mb-8 p-5">
        <div className="flex items-center gap-4">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="h-14 w-14 rounded-full"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xl font-semibold text-[var(--primary-soft-text)]">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-[var(--text-strong)]">
              {displayName}
            </p>
            <p className="truncate text-sm text-zinc-500">{user.email}</p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          即将上线
        </h2>
        <ul className="space-y-2 text-sm text-zinc-600">
          <li className="flex gap-2">
            <span className="text-[var(--primary)]">·</span>
            <span>
              <span className="font-medium text-[var(--text-default)]">
                Phase 3
              </span>{" "}
              AI provider 设置（自带 OpenAI / DeepSeek / Qwen key）
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-[var(--primary)]">·</span>
            <span>
              <span className="font-medium text-[var(--text-default)]">
                Phase 5
              </span>{" "}
              邀请朋友 / 接受推荐
            </span>
          </li>
        </ul>
      </section>

      <section className="border-t border-[var(--border-subtle)] pt-6">
        <form action={signOut}>
          <button
            type="submit"
            className="btn-secondary w-full py-3 text-base"
          >
            退出登录
          </button>
        </form>
      </section>
    </main>
  );
}
