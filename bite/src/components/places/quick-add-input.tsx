"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { processImageDraft, processTextDraft } from "@/lib/actions/quick-add";
import { compressImageIfNeeded } from "@/lib/client/compress-image";
import { detectInputType } from "@/lib/quick-add/detect";
import type { PlaceSuggestion } from "@/lib/places/google";
import {
  AlertIcon,
  LinkIcon,
  MapPinIcon,
  SearchIcon,
  SparklesIcon,
} from "@/components/ui/icons";

/** lucide 风格麦克风（icons.tsx 暂缺，本文件内联） */
function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

/** lucide 风格相机 */
function CameraIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h2.5L8 5.5h8L17.5 8H20a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </svg>
  );
}

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

// 用户当前位置，浏览器 geolocation 失败时回退到 Irvine 中心。
// origin → Google 返回 distanceMeters；locationBias circle → 50km 内优先
// （仍能搜到外地，只是近的排前面）。两个一起传：bias 影响候选选择，origin
// 拿距离 + 我们客户端再按距离 ascending 排一次保险。
const IRVINE_FALLBACK = { lat: 33.6846, lng: -117.8265 };

async function fetchSuggestions(
  input: string,
  sessionToken: string,
  apiKey: string,
  signal: AbortSignal,
  origin: { lat: number; lng: number } | null,
): Promise<PlaceSuggestion[]> {
  const center = origin ?? IRVINE_FALLBACK;
  // Places API v1 用 latitude/longitude 字段名（不是 lat/lng）
  const apiPoint = { latitude: center.lat, longitude: center.lng };
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
      origin: apiPoint,
      locationBias: {
        circle: {
          center: apiPoint,
          radius: 50000, // 50km，覆盖 OC + LA 部分
        },
      },
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
        distanceMeters?: number;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  } = await res.json();
  const items = (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      placeId: p.placeId,
      mainText: p.structuredFormat?.mainText?.text ?? "",
      secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
      distanceMeters: p.distanceMeters,
    }));
  // 按距离 ascending 排；没距离的（极少）丢底
  items.sort((a, b) => {
    if (a.distanceMeters === undefined) return 1;
    if (b.distanceMeters === undefined) return -1;
    return a.distanceMeters - b.distanceMeters;
  });
  return items;
}

export function QuickAddInput() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [state, formAction, pending] = useActionState(processTextDraft, {
    error: null,
  });
  // useState lazy initializer 只跑一次，且 React 不把它判定为不纯（区别于 useMemo body）
  const [sessionToken] = useState<string>(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  });

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // 浏览器定位（一次性，挂载时拿；失败 fallback 到 Irvine 中心，autocomplete 不阻塞）
  const [userLocation, setUserLocation] = useState<
    { lat: number; lng: number } | null
  >(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      // 用户拒绝 / 超时 / 不支持都吞掉 — fetchSuggestions 自带 Irvine fallback
      () => {},
      { timeout: 5000, maximumAge: 5 * 60_000 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const detected = detectInputType(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---- 语音输入（Web Speech API，zh-CN；不支持的浏览器不显示按钮）----
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  // 挂载后一次性探测（SSR 无 window，直接在 initializer 里读会 hydration mismatch）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 卸载时停掉录音——不能让用户导航走了麦克风还开着
  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort?.();
        recRef.current?.stop?.();
      } catch {
        // ignore
      }
    };
  }, []);

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.continuous = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0]?.transcript ?? "")
        .join("");
      if (transcript) {
        setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  // ---- 拍照识店（独立 form，选完文件自动提交）----
  const [imgState, imgAction, imgPending] = useActionState(processImageDraft, {
    error: null,
  });
  const imgFormRef = useRef<HTMLFormElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // 自适应高度
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // 短文本时实时调 Google Places autocomplete
  // 这里在 effect 同步 reset 到 idle 是 deliberate（reset 是对输入条件的 immediate 反馈），
  // 重写成派生 state 会让组件结构复杂化、收益小，因此局部禁用 lint。
  /* eslint-disable react-hooks/set-state-in-effect */
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
          userLocation,
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
  }, [text, detected.kind, apiKey, sessionToken, userLocation]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
        <div className="relative rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] focus-within:border-[var(--primary)] focus-within:ring-3 focus-within:ring-[var(--primary-soft)] transition-colors">
          <span
            aria-hidden
            className="pointer-events-none absolute left-4 top-[15px] text-[var(--text-faint)]"
          >
            <SearchIcon size={18} />
          </span>
          <textarea
            ref={textareaRef}
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            placeholder="粘贴小红书正文、写几句话、或搜店名…"
            className="w-full resize-none rounded-2xl bg-transparent py-3 pl-11 pr-20 text-base outline-none placeholder:text-[var(--text-faint)]"
            maxLength={5000}
          />
          {/* 语音 / 拍照 入口（右上角） */}
          <span className="absolute right-2.5 top-[9px] flex items-center gap-0.5">
            {speechSupported && (
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? "停止语音输入" : "语音输入"}
                title={listening ? "停止语音输入" : "说一段话来记店"}
                className={`rounded-lg p-1.5 transition-colors ${
                  listening
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)] animate-pulse"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
                }`}
              >
                <MicIcon size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => imgInputRef.current?.click()}
              disabled={imgPending}
              aria-label="拍照识店"
              title="拍菜单 / 店面照片，AI 识别入库"
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)] disabled:opacity-50"
            >
              <CameraIcon size={16} />
            </button>
          </span>
          {detected.kind === "free_text" && (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-3.5 py-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-muted)]">
                {detected.hasXhsUrl ? (
                  <LinkIcon size={13} className="shrink-0" />
                ) : (
                  <SparklesIcon size={13} className="shrink-0" />
                )}
                <span className="truncate">
                  {detected.hasXhsUrl
                    ? "小红书链接 · 抓取 + Claude 解析"
                    : "长文本 · 使用 Claude 解析"}
                </span>
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
      </form>

      {/* 拍照识店：独立 form，选完文件自动提交 */}
      <form ref={imgFormRef} action={imgAction}>
        <input
          ref={imgInputRef}
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const input = e.target;
            const file = input.files?.[0];
            if (!file) return;
            // 手机原图会超 Vercel 4.5MB 请求体上限，先压
            const compressed = await compressImageIfNeeded(file);
            if (compressed !== file) {
              const dt = new DataTransfer();
              dt.items.add(compressed);
              input.files = dt.files;
            }
            imgFormRef.current?.requestSubmit();
          }}
        />
        {imgPending && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <SparklesIcon size={13} />
            照片识别中…（菜单 / 店面 / 截图都认得）
          </p>
        )}
        {imgState.error && (
          <p role="alert" className="alert-error mt-2">
            {imgState.error}
          </p>
        )}
      </form>

      {detected.kind === "place_name" && (
        <SuggestionsList
          status={status}
          onPick={pickSuggestion}
          hasApiKey={Boolean(apiKey)}
        />
      )}
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
      <p className="flex items-start gap-1.5 px-2 text-xs text-[var(--text-muted)]">
        <AlertIcon size={13} className="mt-0.5 shrink-0" />
        <span>
          未配置 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY，无法实时搜索。可继续输入更多内容用 AI 解析。
        </span>
      </p>
    );
  }
  if (status.phase === "idle") return null;
  if (status.phase === "searching") {
    return (
      <p className="px-2 text-xs text-[var(--text-muted)]">搜索中…</p>
    );
  }
  if (status.phase === "error") {
    return (
      <p role="alert" className="px-2 text-xs text-[var(--danger-text)]">
        {status.message}
      </p>
    );
  }
  if (status.suggestions.length === 0) {
    return (
      <p className="px-2 text-xs text-[var(--text-muted)]">没找到附近的店</p>
    );
  }
  return (
    <ul className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card-hover)] divide-y divide-[var(--border-subtle)]">
      {status.suggestions.map((s) => (
        <li key={s.placeId}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-muted)]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <MapPinIcon size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-[var(--text-strong)]">
                  {s.mainText}
                </span>
                {s.distanceMeters !== undefined && (
                  <span className="shrink-0 text-[11px] font-semibold text-[var(--primary)]">
                    {formatDistance(s.distanceMeters)}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                {s.secondaryText}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
