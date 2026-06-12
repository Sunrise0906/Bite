"use client";

import Link from "next/link";
import { useState } from "react";
import { UtensilsIcon } from "@/components/ui/icons";

/**
 * PlaceCard 左侧封面图 + 图片数计数 badge。
 * 图片加载失败时回退到中性 placeholder（XHS 防盗链 / 图床挂 / 用户贴错 URL 都会触发）。
 * 抽成 client component 因为父 PlaceCard 是 server component，<img> onError 需要 client。
 */
export function PlaceCardCover({
  href,
  url,
  totalPhotos,
}: {
  href: string;
  url: string;
  totalPhotos: number;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <Link
      href={href}
      className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-xl"
    >
      {broken ? (
        <div className="flex h-full w-full items-center justify-center bg-[var(--surface-muted)] text-[var(--text-faint)]">
          <UtensilsIcon size={22} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      {totalPhotos > 1 && !broken && (
        <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {totalPhotos} 张
        </span>
      )}
    </Link>
  );
}
