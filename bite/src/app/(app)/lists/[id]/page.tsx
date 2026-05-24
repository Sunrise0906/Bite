import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { List, Place } from "@/lib/db/types";
import { RenameListForm } from "@/components/lists/rename-list-form";
import { DeleteListButton } from "@/components/lists/delete-list-button";
import { PlacesView } from "@/components/places/places-view";
import { InviteButton } from "@/components/invites/invite-button";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string; toast?: string }>;

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { error: errorParam } = await searchParams;

  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: list }, { data: placesData }] = await Promise.all([
    supabase
      .from("lists")
      .select("*")
      .eq("id", id)
      .maybeSingle<List>(),
    supabase
      .from("places")
      .select("*")
      .eq("list_id", id)
      .order("updated_at", { ascending: false }),
  ]);

  if (!list) notFound();

  const places = (placesData ?? []) as Place[];
  const isOwner = list.owner_id === user.id;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <Link
        href="/lists"
        className="mb-5 inline-flex items-center text-sm text-zinc-500 transition-colors hover:text-[var(--text-strong)]"
      >
        ‹ 返回所有 list
      </Link>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <RenameListForm id={list.id} currentName={list.name} />
          {isOwner && <InviteButton listId={list.id} />}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
          <span>{places.length} 家店</span>
          {!isOwner && <span className="chip chip-neutral">共享 list</span>}
        </div>
      </header>

      {errorParam && (
        <p role="alert" className="mb-4 alert-error">
          {decodeURIComponent(errorParam)}
        </p>
      )}

      <div className="mb-6">
        <Link
          href={`/lists/${list.id}/places/new`}
          className="btn-primary w-full py-3 text-base"
        >
          + 新增店铺
        </Link>
      </div>

      {places.length === 0 ? (
        <EmptyPlaces />
      ) : (
        <PlacesView places={places} currentUserId={user.id} />
      )}

      {isOwner && (
        <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            设置
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">危险操作</span>
            <DeleteListButton id={list.id} name={list.name} />
          </div>
        </section>
      )}
    </main>
  );
}

function EmptyPlaces() {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <svg
        aria-hidden="true"
        width="56"
        height="56"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mb-4 text-[var(--primary)]"
      >
        <ellipse cx="32" cy="34" rx="22" ry="6" />
        <path d="M10 34v4c0 3 10 6 22 6s22-3 22-6v-4" />
        <path d="M18 24v-6M28 22v-8M38 24v-6M46 22v-8" strokeLinecap="round" />
      </svg>
      <p className="text-sm text-zinc-600">这个 list 还没有店铺</p>
      <p className="mt-1 text-xs text-zinc-500">点上面 “+ 新增店铺” 添加一家</p>
    </div>
  );
}
