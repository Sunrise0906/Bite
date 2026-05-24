"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { processTextDraft } from "@/lib/actions/quick-add";
import { detectInputType } from "@/lib/quick-add/detect";
import type { PlaceSuggestion } from "@/lib/places/google";

type Status =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "loaded"; suggestions: PlaceSuggestion[] }
  | { phase: "error"; message: string };

const PLACES_BASE = "https://places.googleapis.com/v1";
// Google Places API 限制最多 5 个 included_primary_types
const FOOD_TYPES = [
  "restaurant",
  "cafe",
  "bar",
  "bakery",
  "meal_takeaway",
];

async function fetchSuggestions(
  input: string,
  sessionToken: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode: "zh-CN",
      includedPrimaryTypes: FOOD_TYPES,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 120)}`);
  }
  const data: {
    suggestions?: Array<{
      placePrediction?: {
        placeId: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  } = await res.json();
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      placeId: p.placeId,
      mainText: p.structuredFormat?.mainText?.text ?? "",
      secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

export function QuickAddInput() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [state, formAction, pending] = useActionState(processTextDraft, {
    error: null,
  });
  const sessionToken = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  }, []);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const detected = detectInputType(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自适应高度
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // 短文本时实时调 Google Places autocomplete
  useEffect(() => {
    if (detected.kind !== "place_name" || !apiKey) {
      setStatus({ phase: "idle" });
      return;
    }
    if (text.trim().length < 2) {
      setStatus({ phase: "idle" });
      return;
    }

    const controller = new AbortController();
    setStatus({ phase: "searching" });

    const handle = setTimeout(async () => {
      try {
        const suggestions = await fetchSuggestions(
          text.trim(),
          sessionToken,
          apiKey,
          controller.signal,
        );
        setStatus({ phase: "loaded", suggestions });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStatus({
          phase: "error",
          message:
            "搜索失败：" +
            ((err as Error).message ?? "请检查 Google Maps API key"),
        });
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, detected.kind, apiKey, sessionToken]);

  function pickSuggestion(s: PlaceSuggestion) {
    setText("");
    setStatus({ phase: "idle" });
    router.push(
      `/quick-add?placeId=${encodeURIComponent(s.placeId)}&sessionToken=${encodeURIComponent(sessionToken)}`,
    );
  }

  return (
    <div className="space-y-2">
      <form action={formAction} className="relative space-y-2">
        <div className="relative rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)] focus-within:border-[var(--primary)] focus-within:ring-3 focus-within:ring-[var(--primary-soft)] transition-colors">
          <textarea
            ref={textareaRef}
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            placeholder="粘贴小红书正文、写几句话、或搜店名…"
            className="w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-base outline-none placeholder:text-[var(--text-faint)]"
            maxLength={5000}
          />
          {detected.kind === "free_text" && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-3 py-2">
              <span className="text-xs text-zinc-500">
                {detected.hasXhsUrl
                  ? "🔗 小红书链接 · 抓取 + Claude 解析"
                  : "✨ 长文本 · 使用 Claude 解析"}
              </span>
              <button
                type="submit"
                disabled={pending}
                className="btn-primary px-4 py-1.5 text-sm"
              >
                {pending
                  ? detected.hasXhsUrl
                    ? "抓取中…"
                    : "解析中…"
                  : detected.hasXhsUrl
                    ? "抓取并解析"
                    : "用 AI 解析"}
              </button>
            </div>
          )}
        </div>

        {state.error && (
          <p role="alert" className="alert-error">
            {state.error}
          </p>
        )}

        {detected.kind === "place_name" && (
          <SuggestionsList
            status={status}
            onPick={pickSuggestion}
            hasApiKey={Boolean(apiKey)}
          />
        )}
      </form>
    </div>
  );
}

function SuggestionsList({
  status,
  onPick,
  hasApiKey,
}: {
  status: Status;
  onPick: (s: PlaceSuggestion) => void;
  hasApiKey: boolean;
}) {
  if (!hasApiKey) {
    return (
      <p className="text-xs text-zinc-500">
        ⚠️ 未配置 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY，无法实时搜索。可继续输入更多内容用 AI 解析。
      </p>
    );
  }
  if (status.phase === "idle") return null;
  if (status.phase === "searching") {
    return (
      <p className="px-2 text-xs text-zinc-500">搜索中…</p>
    );
  }
  if (status.phase === "error") {
    return (
      <p role="alert" className="px-2 text-xs text-red-600 dark:text-red-400">
        {status.message}
      </p>
    );
  }
  if (status.suggestions.length === 0) {
    return (
      <p className="px-2 text-xs text-zinc-500">没找到附近的店</p>
    );
  }
  return (
    <ul className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-sm">
      {status.suggestions.map((s) => (
        <li key={s.placeId}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-muted)]"
          >
            <span className="mt-0.5 text-[var(--primary)]">📍</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[var(--text-strong)]">
                {s.mainText}
              </span>
              <span className="block truncate text-xs text-zinc-500">
                {s.secondaryText}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
