"use client";

import { useState } from "react";
import type { ProviderId } from "@/lib/llm/types";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";

// 自建 API key 的引导。
//
// 读者是**完全不懂技术的人**（女朋友、朋友），所以：
//   · 先说「为什么值得花这两分钟」，不然没人愿意动
//   · 每一步写出**他们会在屏幕上真实看到的英文按钮名**，而不是「创建密钥」这种译名
//   · 说清 key 长什么样，好让他们确认自己复制对了东西
//   · 主动回答「要钱吗 / 安全吗」——不问出来他们也会心里犯嘀咕而放弃

type Step = { do: string; hint?: string };
type Guide = {
  url: string;
  site: string;
  free: string;
  keyLooksLike: string;
  steps: Step[];
};

const GUIDES: Partial<Record<ProviderId, Guide>> = {
  gemini: {
    url: "https://aistudio.google.com/app/apikey",
    site: "Google AI Studio",
    free: "免费，不用绑银行卡",
    keyLooksLike: "AIza 开头的一长串",
    steps: [
      { do: "用你的 Google 账号登录", hint: "就是平时的 Gmail 账号" },
      { do: "点蓝色按钮 “Create API key”" },
      {
        do: "如果问你选项目，随便选一个 / 点 “Create API key in new project”",
        hint: "选哪个都行，不影响使用",
      },
      { do: "点旁边的复制图标，把那串字复制下来" },
    ],
  },
  qwen: {
    url: "https://bailian.console.aliyun.com/?tab=model#/api-key",
    site: "阿里云百炼",
    free: "有免费额度",
    keyLooksLike: "sk- 开头的一长串",
    steps: [
      { do: "用支付宝/淘宝账号登录阿里云", hint: "首次可能要开通「百炼」服务，免费" },
      { do: "点「创建我的 API-KEY」" },
      { do: "点「查看」再复制那串字" },
    ],
  },
  deepseek: {
    url: "https://platform.deepseek.com/api_keys",
    site: "DeepSeek 开放平台",
    free: "注册送额度",
    keyLooksLike: "sk- 开头的一长串",
    steps: [
      { do: "注册 / 登录" },
      { do: "点「创建 API key」，随便起个名字" },
      { do: "复制弹出来的那串字", hint: "只显示一次，一定要当场复制" },
    ],
  },
  openai: {
    url: "https://platform.openai.com/api-keys",
    site: "OpenAI Platform",
    free: "⚠️ 需要绑卡并充值，不免费",
    keyLooksLike: "sk- 开头的一长串",
    steps: [
      { do: "登录后点 “Create new secret key”" },
      { do: "复制弹出来的那串字", hint: "只显示一次" },
    ],
  },
  anthropic: {
    url: "https://console.anthropic.com/settings/keys",
    site: "Anthropic Console",
    free: "⚠️ 需要充值，不免费",
    keyLooksLike: "sk-ant- 开头的一长串",
    steps: [
      { do: "登录后点 “Create Key”" },
      { do: "复制弹出来的那串字", hint: "只显示一次" },
    ],
  },
};

export function ApiKeyGuide({
  provider,
  usedToday,
  quota,
}: {
  provider: ProviderId;
  /** 今天用掉的共享额度次数（用户自带 key 时不传） */
  usedToday?: number;
  quota?: number;
}) {
  const [open, setOpen] = useState(false);
  const g = GUIDES[provider];
  if (!g) return null;

  const nearLimit =
    usedToday != null && quota != null && usedToday >= quota * 0.7;

  return (
    <div
      className={`mt-3 overflow-hidden rounded-xl border ${
        nearLimit
          ? "border-[var(--gold)] bg-[var(--gold-soft)]/40"
          : "border-[var(--border-subtle)] bg-[var(--surface-muted)]/60"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-[var(--text-strong)]">
            用自己的 key，就不用跟别人抢额度
          </span>
          <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
            {usedToday != null && quota != null ? (
              <>
                今天共用额度已用 <b>{usedToday}</b>/{quota} 次 ·{" "}
              </>
            ) : null}
            {g.free} · 约 2 分钟
          </span>
        </span>
        {open ? (
          <ChevronDownIcon size={16} className="shrink-0 text-[var(--text-muted)]" />
        ) : (
          <ChevronRightIcon size={16} className="shrink-0 text-[var(--text-muted)]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--border-subtle)] px-3.5 py-3">
          <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
            现在大家共用一把 key，而这类免费额度是<b>按 key 算的、不是按人算的</b> ——
            所以一个人多用一点，别人就会被挡。自己弄一把之后，你用你的，互不影响。
          </p>

          <ol className="mt-3 space-y-2.5">
            <li className="flex gap-2.5">
              <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-[var(--primary-foreground)]">
                1
              </span>
              <span className="text-xs text-[var(--text-default)]">
                打开{" "}
                <a
                  href={g.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[var(--primary)] underline"
                >
                  {g.site} ↗
                </a>
              </span>
            </li>
            {g.steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-[var(--primary-foreground)]">
                  {i + 2}
                </span>
                <span className="text-xs text-[var(--text-default)]">
                  {s.do}
                  {s.hint && (
                    <span className="mt-0.5 block text-[11px] text-[var(--text-faint)]">
                      {s.hint}
                    </span>
                  )}
                </span>
              </li>
            ))}
            <li className="flex gap-2.5">
              <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] text-[10px] font-bold text-white">
                ✓
              </span>
              <span className="text-xs text-[var(--text-default)]">
                回到这一页，粘进上面的 <b>API Key</b> 框，点<b>「保存设置」</b>
                <span className="mt-0.5 block text-[11px] text-[var(--text-faint)]">
                  想确认有没有弄对，点旁边的「测试连接」
                </span>
              </span>
            </li>
          </ol>

          <div className="mt-3 space-y-1.5 rounded-lg bg-[var(--surface-elevated)] px-3 py-2.5">
            <p className="text-[11px] text-[var(--text-muted)]">
              <b className="text-[var(--text-default)]">复制对了吗？</b>{" "}
              是 {g.keyLooksLike}，不是网址、也不是邮箱。
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              <b className="text-[var(--text-default)]">会扣钱吗？</b>{" "}
              {g.free.startsWith("⚠️")
                ? "这家要付费。想免费的话回上面选 Google Gemini。"
                : "在免费额度内不扣钱，也不用绑卡。"}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              <b className="text-[var(--text-default)]">安全吗？</b>{" "}
              key 加密后存在数据库里，页面上不会再显示出来。随时可以点「清除」删掉，
              或者去上面那个网站把它作废。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
