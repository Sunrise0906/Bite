import Link from "next/link";
import type { Place, PlacePrice } from "@/lib/db/types";
import { StatusQuickToggle } from "./status-quick-toggle";
import { PlaceCardMenu } from "./place-card-menu";

const STATUS_LABEL: Record<Place["status"], string> = {
  want_to_go: "想去",
  visited: "已去过",
  archived: "归档",
};

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

export function PlaceCard({
  place,
  currentUserId,
}: {
  place: Place;
  currentUserId: string;
}) {
  const myReason = place.reasons.find((r) => r.user_id === currentUserId)?.text;
  const photos = place.photo_urls ?? [];
  const cover = photos[0];

  return (
    <article className="card block overflow-hidden p-0">
      <div className="flex">
        {cover && (
          <Link
            href={`/lists/${place.list_id}/places/${place.id}/edit`}
            className="relative block shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              className="h-full max-h-32 w-24 object-cover sm:w-28"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            {photos.length > 1 && (
              <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                {photos.length} 张
              </span>
            )}
          </Link>
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
              <div className="flex items-center gap-1">
                <StatusQuickToggle
                  placeId={place.id}
                  listId={place.list_id}
                  currentStatus={place.status}
                  label={STATUS_LABEL[place.status]}
                  chipClass={STATUS_CHIP[place.status]}
                />
                <PlaceCardMenu
                  placeId={place.id}
                  listId={place.list_id}
                  placeName={place.name}
                />
              </div>
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

          {place.cuisine.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
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
