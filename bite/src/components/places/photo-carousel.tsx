"use client";

import { useEffect, useRef, useState } from "react";

export function PhotoCarousel({ urls }: { urls: string[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // 哪些图加载失败了（XHS CDN 防盗链 / 图床挂了 / URL 输错都会触发）
  const [broken, setBroken] = useState<Set<number>>(new Set());

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const w = el.clientWidth;
      if (w === 0) return;
      const idx = Math.round(el.scrollLeft / w);
      setActive(Math.min(Math.max(idx, 0), urls.length - 1));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [urls.length]);

  if (urls.length === 0) return null;

  function scrollTo(i: number) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth * i, behavior: "smooth" });
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {urls.map((u, i) =>
          broken.has(i) ? (
            <div
              key={i}
              className="flex aspect-video w-full shrink-0 snap-center flex-col items-center justify-center bg-[var(--surface-subtle)] text-sm text-zinc-500"
            >
              <span className="text-2xl" aria-hidden>
                🖼️
              </span>
              <span className="mt-1 text-xs">图片加载失败</span>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={u}
              alt={`图 ${i + 1} / ${urls.length}`}
              onError={() =>
                setBroken((prev) => {
                  const next = new Set(prev);
                  next.add(i);
                  return next;
                })
              }
              className="aspect-video w-full shrink-0 snap-center object-cover"
              loading={i === 0 ? "eager" : "lazy"}
              referrerPolicy="no-referrer"
            />
          ),
        )}
      </div>

      {urls.length > 1 && (
        <>
          {/* 左右箭头（桌面） */}
          <button
            type="button"
            aria-label="上一张"
            disabled={active === 0}
            onClick={() => scrollTo(active - 1)}
            className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-30 sm:flex"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="下一张"
            disabled={active === urls.length - 1}
            onClick={() => scrollTo(active + 1)}
            className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-30 sm:flex"
          >
            ›
          </button>

          {/* 角标计数 */}
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
            {active + 1} / {urls.length}
          </span>

          {/* 圆点指示 */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`跳到第 ${i + 1} 张`}
                onClick={() => scrollTo(i)}
                className={
                  i === active
                    ? "h-1.5 w-4 rounded-full bg-white transition-all"
                    : "h-1.5 w-1.5 rounded-full bg-white/55 transition-all"
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
