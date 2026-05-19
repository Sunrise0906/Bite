import Link from "next/link";
import type { Place } from "@/lib/db/types";

const STATUS_LABEL: Record<Place["status"], string> = {
  want_to_go: "想去",
  visited: "已去过",
  archived: "归档",
};

const STATUS_BADGE: Record<Place["status"], string> = {
  want_to_go:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  visited:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  archived: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
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
      className="block rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-medium">{place.name}</h3>
          <p className="mt-0.5 truncate text-sm text-zinc-500">
            {place.address}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[place.status]}`}
          >
            {STATUS_LABEL[place.status]}
          </span>
          {place.price_range && (
            <span className="text-xs text-zinc-500">{place.price_range}</span>
          )}
        </div>
      </div>

      {place.cuisine.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {place.cuisine.map((c) => (
            <span
              key={c}
              className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {myReason && (
        <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
          “{myReason}”
        </p>
      )}
    </Link>
  );
}
