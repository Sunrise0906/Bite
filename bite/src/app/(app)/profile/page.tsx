import { signOut } from "@/lib/actions/auth";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Profile } from "@/lib/db/types";
import { LlmSettingsForm } from "@/components/profile/llm-settings-form";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { ChevronRightIcon, InboxIcon } from "@/components/ui/icons";
import { PROVIDER_PRESETS, type ProviderId } from "@/lib/llm/types";
import type { UserLlmSettings } from "@/lib/llm/router";
import { decryptSecret } from "@/lib/crypto/secret-box";

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
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3">
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="heading-display mt-1 text-xl text-[var(--text-strong)]">
        {total.toLocaleString()}
        <span className="ml-1 font-sans text-xs font-normal text-[var(--text-muted)]">
          tokens
        </span>
      </p>
      <p className="mt-1 text-[11px] text-[var(--text-faint)]">
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
    <main className="mx-auto w-full max-w-2xl px-5 py-7 sm:py-10">
      <header className="mb-8">
        <h1 className="heading-display text-3xl sm:text-4xl">我的</h1>
      </header>

      <section className="card mb-8 px-5 py-5">
        <ProfileEditForm
          initialName={profile?.name ?? null}
          initialAvatarUrl={profile?.avatar_url ?? null}
          email={user.email ?? ""}
        />
      </section>

      {/* ---- AI 用量 ---- */}
      <section className="card mb-8 px-5 py-5">
        <div className="section-heading mb-4">
          <h2 className="text-lg text-[var(--text-strong)]">AI 用量</h2>
          <span className="text-xs text-[var(--text-muted)]">
            {turns > 0 ? `${turns} 轮对话` : "还没有数据"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <UsageBox label="本月" inTok={monthIn} outTok={monthOut} />
          <UsageBox label="全部" inTok={allIn} outTok={allOut} />
        </div>
        <p className="mt-3 text-[11px] text-[var(--text-faint)]">
          tokens 直接来自 provider 返回。Gemini 在免费 tier 内不计费；其他 provider 自带 key 时按各自计费。
        </p>
      </section>

      {/* ---- AI Provider 设置 ---- */}
      <section className="card mb-8 px-5 py-5">
        <div className="mb-4">
          <div className="section-heading">
            <h2 className="text-lg text-[var(--text-strong)]">AI 模型设置</h2>
          </div>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            选你喜欢的 provider。可以用我们提供的默认额度，也可以填自己的 key 走自己额度。
          </p>
        </div>
        <LlmSettingsForm
          initial={
            llmSettings
              ? { ...llmSettings, api_key: llmSettings.api_key ? decryptSecret(llmSettings.api_key) : null }
              : null
          }
          appKeyAvailable={appKeyAvailable}
        />
      </section>

      <section className="mb-8">
        <div className="section-heading mb-3">
          <h2 className="text-lg text-[var(--text-strong)]">其他</h2>
        </div>
        <a
          href="/recommendations"
          className="card card-interactive flex items-center justify-between px-5 py-4 text-sm"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <InboxIcon
              size={18}
              className="shrink-0 text-[var(--primary)]"
            />
            <span className="font-medium text-[var(--text-strong)]">收件箱</span>
            <span className="truncate text-[var(--text-muted)]">
              朋友推荐的店
            </span>
            {pendingRecCount && pendingRecCount > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[11px] font-semibold text-[var(--primary-foreground)]">
                {pendingRecCount}
              </span>
            ) : null}
          </span>
          <ChevronRightIcon
            size={16}
            className="shrink-0 text-[var(--text-faint)]"
          />
        </a>
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
