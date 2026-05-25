import Link from "next/link";
import type { Place, PlacePrice } from "@/lib/db/types";
import { StatusQuickToggle } from "./status-quick-toggle";
import { PlaceCardMenu } from "./place-card-menu";
import { PlaceCardCover } from "./card-cover";
import { VisitLogButton } from "@/components/visits/visit-log-button";
import type { PlaceVisitSummary } from "./places-view";

const SENTIMENT_EMOJI: Record<
  PlaceVisitSummary["last_sentiment"],
  string
> = {
  will_return: "❤️",
  okay: "🟡",
  wont_return: "👎",
};

function relDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}

const STATUS_CHIP: Record<Place["status"], string> = {
  want_to_go: "chip chip-want",
  visited: "chip chip-visited",
  archived: "chip chip-archived",
};

const PRICE_RANGE: Record<PlacePrice, string> = {
  $: "<$15",
  $$: "$15-30",
  $$$: "$30-60",
  $$$$: ">$60",
};

const SOURCE_BADGE: Record<
  string,
  { icon: string; label: string } | null
> = {
  manual: null, // 默认手动加，不显示
  xhs: { icon: "📕", label: "来自小红书" },
  ai_extract: { icon: "🤖", label: "AI 抽取" },
  google_places: { icon: "🗺️", label: "Google Places" },
  yelp: { icon: "⭐", label: "Yelp" },
};

export function PlaceCard({
  place,
  currentUserId,
  canEdit = true,
  visitSummary = null,
  reasonAuthors = {},
}: {
  place: Place;
  currentUserId: string;
  canEdit?: boolean;
  visitSummary?: PlaceVisitSummary | null;
  reasonAuthors?: Record<string, string>;
}) {
  const reasons = place.reasons ?? [];
  const myReason = reasons.find((r) => r.user_id === currentUserId)?.text;
  const otherReasons = reasons.filter((r) => r.user_id !== currentUserId);
  const photos = place.photo_urls ?? [];
  const cover = photos[0];

  return (
    <article className="card block overflow-hidden p-0">
      <div className="flex">
        {cover && (
          <PlaceCardCover
            href={`/lists/${place.list_id}/places/${place.id}/edit`}
            url={cover}
            totalPhotos={photos.length}
          />
        )}
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <Link
              href={`/lists/${place.list_id}/places/${place.id}/edit`}
              className="min-w-0 flex-1 transition-colors hover:opacity-80"
            >
              <h3 className="truncate text-base font-medium text-[var(--text-strong)]">
                {place.name}
              </h3>
              <p className="mt-0.5 truncate text-sm text-zinc-500">
                {place.address}
              </p>
            </Link>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {canEdit ? (
                <div className="flex items-center gap-1">
                  <StatusQuickToggle
                    placeId={place.id}
                    listId={place.list_id}
                    currentStatus={place.status}
                    chipClass={STATUS_CHIP[place.status]}
                  />
                  <PlaceCardMenu
                    placeId={place.id}
                    listId={place.list_id}
                    placeName={place.name}
                  />
                </div>
              ) : (
                <span className={STATUS_CHIP[place.status]}>
                  {place.status === "want_to_go"
                    ? "想去"
                    : place.status === "visited"
                      ? "已去过"
                      : "归档"}
                </span>
              )}
              {canEdit && <VisitLogButton placeId={place.id} variant="chip" />}
              {place.price_range && (
                <span
                  className="text-xs font-medium text-zinc-500"
                  title={PRICE_RANGE[place.price_range]}
                >
                  {place.price_range}
                  <span className="ml-1 text-zinc-400">
                    {PRICE_RANGE[place.price_range]}
                  </span>
                </span>
              )}
            </div>
          </div>

          {(place.cuisine.length > 0 || SOURCE_BADGE[place.source]) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1">
              {SOURCE_BADGE[place.source] && (
                <span
                  className="inline-flex items-center text-sm"
                  title={SOURCE_BADGE[place.source]!.label}
                  aria-label={SOURCE_BADGE[place.source]!.label}
                >
                  {SOURCE_BADGE[place.source]!.icon}
                </span>
              )}
              {place.cuisine.map((c) => (
                <span key={c} className="chip chip-neutral">
                  {c}
                </span>
              ))}
            </div>
          )}

          {myReason && (
            <p className="mt-2.5 line-clamp-2 text-sm text-zinc-600">
              <span className="text-[var(--primary)]">“</span>
              {myReason}
              <span className="text-[var(--primary)]">”</span>
            </p>
          )}

          {otherReasons.length > 0 &&
            otherReasons.slice(0, 2).map((r, i) => {
              const author = reasonAuthors[r.user_id] ?? "朋友";
              return (
                <p
                  key={`${r.user_id}-${i}`}
                  className="mt-1.5 line-clamp-2 text-sm text-zinc-600"
                >
                  <span className="mr-1 inline-flex items-baseline rounded-full bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
                    @{author}
                  </span>
                  <span className="text-[var(--primary)]">“</span>
                  {r.text}
                  <span className="text-[var(--primary)]">”</span>
                </p>
              );
            })}
          {otherReasons.length > 2 && (
            <p className="mt-0.5 text-[11px] text-zinc-400">
              还有 {otherReasons.length - 2} 条 reason
            </p>
          )}

          {visitSummary && visitSummary.count > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
              <span>
                <span aria-hidden>{SENTIMENT_EMOJI[visitSummary.last_sentiment]}</span>{" "}
                去过 {visitSummary.count} 次
              </span>
              <span className="text-zinc-400">· {relDate(visitSummary.last_visit)}</span>
              {visitSummary.avg_star !== null && (
                <span className="text-amber-500">
                  {"★".repeat(Math.round(visitSummary.avg_star))}
                  <span className="text-zinc-300">
                    {"★".repeat(5 - Math.round(visitSummary.avg_star))}
                  </span>
                </span>
              )}
            </p>
          )}

          {place.notes && (
            <p className="mt-2 line-clamp-2 rounded-md bg-[var(--surface-muted)]/60 px-2 py-1.5 text-xs italic text-zinc-500">
              🤖 {place.notes}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
