import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Place } from "@/lib/db/types";
import { PlaceForm } from "@/components/places/place-form";
import { DeletePlaceButton } from "@/components/places/delete-place-button";

type Params = Promise<{ id: string; placeId: string }>;

export default async function EditPlacePage({ params }: { params: Params }) {
  const { id: listId, placeId } = await params;

  const user = await requireUser();
  const supabase = await createClient();

  const { data: place } = await supabase
    .from("places")
    .select("*")
    .eq("id", placeId)
    .eq("list_id", listId)
    .maybeSingle<Place>();

  if (!place) notFound();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <Link
        href={`/lists/${listId}`}
        className="mb-4 inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ‹ 返回所在 list
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        编辑店铺
      </h1>
      <PlaceForm
        mode="edit"
        listId={listId}
        place={place}
        currentUserId={user.id}
      />

      <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">危险操作</h2>
        <DeletePlaceButton
          placeId={place.id}
          listId={listId}
          name={place.name}
        />
      </div>
    </main>
  );
}
