import Link from "next/link";
import type { Place } from "@/lib/db/types";

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

export function PlaceCard({
  place,
  currentUserId,
}: {
  place: Place;
  currentUserId: string;
}) {
  const myReason = place.reasons.find((r) => r.user_id === currentUserId)?.text;

  return (
    <Link
      href={`/lists/${place.list_id}/places/${place.id}/edit`}
      className="card card-interactive block p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-medium text-[var(--text-strong)]">
            {place.name}
          </h3>
          <p className="mt-0.5 truncate text-sm text-zinc-500">
            {place.address}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={STATUS_CHIP[place.status]}>
            {STATUS_LABEL[place.status]}
          </span>
          {place.price_range && (
            <span className="text-xs font-medium text-zinc-500">
              {place.price_range}
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
    </Link>
  );
}
