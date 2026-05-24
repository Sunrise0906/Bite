import { signOut } from "@/lib/actions/auth";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Profile } from "@/lib/db/types";
import { LlmSettingsForm } from "@/components/profile/llm-settings-form";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { PROVIDER_PRESETS, type ProviderId } from "@/lib/llm/types";
import type { UserLlmSettings } from "@/lib/llm/router";

export const metadata = {
  title: "我的 · Bite",
};

function UsageBox({
  label,
  inTok,
  outTok,
}: {
  label: string;
  inTok: number;
  outTok: number;
}) {
  const total = inTok + outTok;
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-[var(--text-strong)]">
        {total.toLocaleString()}
        <span className="ml-1 text-xs font-normal text-zinc-500">tokens</span>
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">
        in {inTok.toLocaleString()} · out {outTok.toLocaleString()}
      </p>
    </div>
  );
}

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [
    { data: profile },
    { data: llmSettings },
    { data: usageRows },
    { count: pendingRecCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    supabase
      .from("user_llm_settings")
      .select("provider, api_key, base_url, chat_model, extract_model")
      .eq("user_id", user.id)
      .maybeSingle<UserLlmSettings>(),
    // RLS 限制只能拿到自己 convos 下的 messages
    supabase
      .from("messages")
      .select("usage, created_at")
      .eq("role", "assistant")
      .not("usage", "is", null),
    // 待处理推荐数
    supabase
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("to_user_id", user.id)
      .eq("status", "pending"),
  ]);

  // 汇总 token 用量（全部 + 本月）
  type UsageRow = {
    usage: { input_tokens?: number; output_tokens?: number } | null;
    created_at: string;
  };
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let allIn = 0,
    allOut = 0,
    monthIn = 0,
    monthOut = 0,
    turns = 0;
  for (const row of (usageRows ?? []) as UsageRow[]) {
    if (!row.usage) continue;
    const i = row.usage.input_tokens ?? 0;
    const o = row.usage.output_tokens ?? 0;
    allIn += i;
    allOut += o;
    turns += 1;
    if (new Date(row.created_at) >= monthStart) {
      monthIn += i;
      monthOut += o;
    }
  }

  // 检测 env 里有没有配 app default key（让用户知道是否能"留空走默认"）
  const appKeyAvailable: Record<ProviderId, boolean> = {
    gemini: Boolean(process.env[PROVIDER_PRESETS.gemini.apiKeyEnvVar]),
    anthropic: Boolean(process.env[PROVIDER_PRESETS.anthropic.apiKeyEnvVar]),
    openai: Boolean(process.env[PROVIDER_PRESETS.openai.apiKeyEnvVar]),
    deepseek: Boolean(process.env[PROVIDER_PRESETS.deepseek.apiKeyEnvVar]),
    qwen: Boolean(process.env[PROVIDER_PRESETS.qwen.apiKeyEnvVar]),
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="heading-display text-3xl sm:text-4xl">我的</h1>
      </header>

      <section className="card mb-8 p-5">
        <ProfileEditForm
          initialName={profile?.name ?? null}
          initialAvatarUrl={profile?.avatar_url ?? null}
          email={user.email ?? ""}
        />
      </section>

      {/* ---- AI 用量 ---- */}
      <section className="card mb-8 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-[var(--text-strong)]">
            AI 用量
          </h2>
          <span className="text-xs text-zinc-500">
            {turns > 0 ? `${turns} 轮对话` : "还没有数据"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <UsageBox label="本月" inTok={monthIn} outTok={monthOut} />
          <UsageBox label="全部" inTok={allIn} outTok={allOut} />
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">
          tokens 直接来自 provider 返回。Gemini 在免费 tier 内不计费；其他 provider 自带 key 时按各自计费。
        </p>
      </section>

      {/* ---- AI Provider 设置 ---- */}
      <section className="card mb-8 p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[var(--text-strong)]">
            AI 模型设置
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            选你喜欢的 provider。可以用我们提供的默认额度，也可以填自己的 key 走自己额度。
          </p>
        </div>
        <LlmSettingsForm
          initial={llmSettings ?? null}
          appKeyAvailable={appKeyAvailable}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          其他
        </h2>
        <a
          href="/recommendations"
          className="card-interactive flex items-center justify-between rounded-xl px-4 py-3 text-sm"
        >
          <span className="flex items-center gap-2">
            <span>📬</span>
            <span className="font-medium text-[var(--text-strong)]">收件箱</span>
            <span className="text-zinc-500">朋友推荐的店</span>
            {pendingRecCount && pendingRecCount > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[11px] font-semibold text-white">
                {pendingRecCount}
              </span>
            ) : null}
          </span>
          <span className="text-zinc-400">›</span>
        </a>
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
                Phase 4
              </span>{" "}
              我去了 / VisitLog / 地图
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
