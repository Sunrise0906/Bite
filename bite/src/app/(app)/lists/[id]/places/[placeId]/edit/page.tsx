import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Place, VisitLog } from "@/lib/db/types";
import { PlaceForm } from "@/components/places/place-form";
import { DeletePlaceButton } from "@/components/places/delete-place-button";
import { VisitHistory } from "@/components/visits/visit-history";
import { RecommendButton } from "@/components/recommendations/recommend-button";

type Params = Promise<{ id: string; placeId: string }>;

export default async function EditPlacePage({ params }: { params: Params }) {
  const { id: listId, placeId } = await params;

  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: place }, { data: visitLogs }] = await Promise.all([
    supabase
      .from("places")
      .select("*")
      .eq("id", placeId)
      .eq("list_id", listId)
      .maybeSingle<Place>(),
    supabase
      .from("visit_logs")
      .select("*")
      .eq("place_id", placeId)
      .order("visited_at", { ascending: false }),
  ]);

  if (!place) notFound();
  const logs = (visitLogs ?? []) as VisitLog[];

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <Link
        href={`/lists/${listId}`}
        className="mb-5 inline-flex items-center text-sm text-zinc-500 transition-colors hover:text-[var(--text-strong)]"
      >
        ‹ 返回所在 list
      </Link>
      <div className="mb-6 flex items-start justify-between gap-3">
        <h1 className="heading-display text-3xl">编辑店铺</h1>
        <RecommendButton placeId={place.id} placeName={place.name} />
      </div>
      <PlaceForm
        mode="edit"
        listId={listId}
        place={place}
        currentUserId={user.id}
      />

      <div className="mt-10 border-t border-[var(--border-subtle)] pt-6">
        <VisitHistory placeId={place.id} logs={logs} />
      </div>

      <div className="mt-12 border-t border-[var(--border-subtle)] pt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          危险操作
        </h2>
        <DeletePlaceButton
          placeId={place.id}
          listId={listId}
          name={place.name}
        />
      </div>
    </main>
  );
}
