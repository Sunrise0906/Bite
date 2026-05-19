import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { PlaceForm } from "@/components/places/place-form";

type Params = Promise<{ id: string }>;

export default async function NewPlacePage({ params }: { params: Params }) {
  const { id: listId } = await params;

  const user = await requireUser();
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("lists")
    .select("id, name")
    .eq("id", listId)
    .maybeSingle();

  if (!list) notFound();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <Link
        href={`/lists/${listId}`}
        className="mb-4 inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ‹ 返回 “{list.name}”
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        新增店铺
      </h1>
      <PlaceForm
        mode="create"
        listId={listId}
        currentUserId={user.id}
      />
    </main>
  );
}
