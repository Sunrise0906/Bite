import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { PlaceForm } from "@/components/places/place-form";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "新增店铺 · Bite",
};

/** lucide 风格 chevron-left（icons.tsx 暂缺，先内联） */
function ChevronLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

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
    <main className="mx-auto w-full max-w-xl px-5 py-7 sm:py-12">
      <Link
        href={`/lists/${listId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
      >
        <ChevronLeftIcon size={15} />
        返回 “{list.name}”
      </Link>
      <header className="mb-8">
        <h1 className="heading-display text-3xl">新增店铺</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          记下店名和地址就行，细节可以以后慢慢补
        </p>
      </header>
      <PlaceForm mode="create" listId={listId} currentUserId={user.id} />
    </main>
  );
}
