import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { Place, PlacePrice } from "@/lib/db/types";
import { StatusQuickToggle } from "./status-quick-toggle";
import { PlaceCardMenu } from "./place-card-menu";
import { PlaceCardCover } from "./card-cover";
import { VisitLogButton } from "@/components/visits/visit-log-button";
import { relDate } from "@/lib/util/rel-date";
import {
  BookIcon,
  BotIcon,
  CheckIcon,
  GlobeIcon,
  HeartIcon,
  MapPinIcon,
  StarIcon,
  ThumbsDownIcon,
} from "@/components/ui/icons";
import type { PlaceVisitSummary } from "./places-view";

const SENTIMENT_DISPLAY: Record<
  PlaceVisitSummary["last_sentiment"],
  { icon: ReactNode; label: string }
> = {
  will_return: { icon: <HeartIcon size={12} filled />, label: "还想再来" },
  okay: { icon: <CheckIcon size={12} />, label: "一般般" },
  wont_return: { icon: <ThumbsDownIcon size={12} />, label: "不会再来" },
};

const STATUS_CHIP: Record<Place["status"], string> = {
  want_to_go: "chip chip-want",
  visited: "chip chip-visited",
  archived: "chip chip-archived",
};

const STATUS_LABEL: Record<Place["status"], string> = {
  want_to_go: "想去",
  visited: "已去过",
  archived: "归档",
};

const PRICE_RANGE: Record<PlacePrice, string> = {
  $: "<$15",
  $$: "$15-30",
  $$$: "$30-60",
  $$$$: ">$60",
};

type SourceIcon = ComponentType<{ size?: number; className?: string }>;

const SOURCE_BADGE: Record<
  string,
  { Icon: SourceIcon; label: string } | null
> = {
  manual: null, // 默认手动加，不显示
  xhs: { Icon: BookIcon, label: "来自小红书" },
  ai_extract: { Icon: BotIcon, label: "AI 抽取" },
  google_places: { Icon: GlobeIcon, label: "Google Places" },
  yelp: { Icon: StarIcon, label: "Yelp" },
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
  const editHref = `/lists/${place.list_id}/places/${place.id}/edit`;
  const source = SOURCE_BADGE[place.source];
  const sentiment =
    visitSummary && visitSummary.count > 0
      ? SENTIMENT_DISPLAY[visitSummary.last_sentiment]
      : null;
  const hasMeta =
    Boolean(place.address) ||
    place.cuisine.length > 0 ||
    Boolean(place.price_range);

  return (
    <article className="card overflow-hidden">
      <div className="flex gap-4 px-5 py-4">
        {cover && (
          <PlaceCardCover
            href={editHref}
            url={cover}
            totalPhotos={photos.length}
          />
        )}

        <div className="min-w-0 flex-1">
          {/* 第 1 层：标题行 = 店名 + 状态 chip / 操作 */}
          <div className="flex items-start justify-between gap-2">
            <Link
              href={editHref}
              className="min-w-0 flex-1 transition-opacity hover:opacity-80"
            >
              <h3 className="truncate text-[15px] font-semibold text-[var(--text-strong)]">
                {place.name}
              </h3>

              {/* 第 2 层：meta 行 = 地址 + 菜系 + 价位 */}
              {hasMeta && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--text-muted)]">
                  {place.address && (
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                      <MapPinIcon
                        size={12}
                        className="shrink-0 text-[var(--text-faint)]"
                      />
                      <span className="truncate">{place.address}</span>
                    </span>
                  )}
                  {place.cuisine.length > 0 && (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {place.cuisine.map((c) => (
                        <span key={c} className="tag tag-neutral">
                          {c}
                        </span>
                      ))}
                    </span>
                  )}
                  {place.price_range && (
                    <span
                      className="font-medium"
                      title={PRICE_RANGE[place.price_range]}
                    >
                      {place.price_range}
                      <span className="ml-1 font-normal text-[var(--text-faint)]">
                        {PRICE_RANGE[place.price_range]}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </Link>

            <div className="flex shrink-0 items-center gap-1">
              {canEdit ? (
                <>
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
                </>
              ) : (
                <span className={STATUS_CHIP[place.status]}>
                  {STATUS_LABEL[place.status]}
                </span>
              )}
            </div>
          </div>

          {/* 第 3 层：reason 引用体 */}
          {myReason && (
            <p className="mt-2.5 line-clamp-2 border-l-2 border-[var(--gold)] pl-2.5 text-[13px] italic leading-relaxed text-[var(--text-default)]">
              {myReason}
            </p>
          )}

          {otherReasons.length > 0 &&
            otherReasons.slice(0, 2).map((r, i) => {
              const author = reasonAuthors[r.user_id] ?? "朋友";
              return (
                <p
                  key={`${r.user_id}-${i}`}
                  className="mt-1.5 line-clamp-2 border-l-2 border-[var(--border-default)] pl-2.5 text-[13px] italic leading-relaxed text-[var(--text-muted)]"
                >
                  <span className="mr-1.5 inline-flex items-baseline rounded-full bg-[var(--sage-soft)] px-1.5 py-0.5 text-[10px] font-semibold not-italic text-[var(--sage-text)]">
                    @{author}
                  </span>
                  {r.text}
                </p>
              );
            })}
          {otherReasons.length > 2 && (
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">
              还有 {otherReasons.length - 2} 条 reason
            </p>
          )}

          {/* 第 3 层：visit 信号 */}
          {visitSummary && visitSummary.count > 0 && sentiment && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  visitSummary.last_sentiment === "will_return"
                    ? "text-[var(--sage-text)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {sentiment.icon}
                去过 {visitSummary.count} 次 · {sentiment.label}
              </span>
              <span className="text-[var(--text-faint)]">
                {relDate(visitSummary.last_visit)}
              </span>
              {visitSummary.avg_star !== null && (
                <span className="inline-flex items-center gap-0.5 text-[var(--gold)]">
                  <StarIcon size={11} filled />
                  <span className="font-medium">
                    {visitSummary.avg_star.toFixed(1)}
                  </span>
                </span>
              )}
            </p>
          )}

          {/* 第 3 层：AI 备注 */}
          {place.notes && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[var(--surface-muted)]/60 px-2.5 py-1.5 text-xs italic text-[var(--text-muted)]">
              <BotIcon
                size={12}
                className="mt-0.5 shrink-0 text-[var(--text-faint)]"
              />
              <span className="line-clamp-2">{place.notes}</span>
            </p>
          )}

          {/* 底部行：记录造访 + 来源小字（右下角） */}
          {(canEdit || source) && (
            <div className="mt-2.5 flex items-center justify-between gap-2">
              {canEdit ? (
                <VisitLogButton placeId={place.id} variant="chip" />
              ) : (
                <span />
              )}
              {source && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] text-[var(--text-faint)]"
                  title={source.label}
                  aria-label={source.label}
                >
                  <source.Icon size={12} />
                  {source.label}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
