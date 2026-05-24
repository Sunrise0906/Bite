import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Place, VisitLog } from "@/lib/db/types";
import { PlaceForm } from "@/components/places/place-form";
import { DeletePlaceButton } from "@/components/places/delete-place-button";
import { VisitHistory } from "@/components/visits/visit-history";
import { RecommendButton } from "@/components/recommendations/recommend-button";

type Params = Promise<{ id: string; placeId: string }>;

export async function generateMetadata(props: { params: Params }) {
  const { id: listId, placeId } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("name")
    .eq("id", placeId)
    .eq("list_id", listId)
    .maybeSingle<{ name: string }>();
  return {
    title: data?.name ? `${data.name} · Bite` : "店铺 · Bite",
  };
}

export default async function EditPlacePage({ params }: { params: Params }) {
  const { id: listId, placeId } = await params;

  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: place }, { data: visitLogs }, { data: listRow }] =
    await Promise.all([
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
      supabase
        .from("lists")
        .select("owner_id")
        .eq("id", listId)
        .maybeSingle<{ owner_id: string }>(),
    ]);

  if (!place) notFound();
  const logs = (visitLogs ?? []) as VisitLog[];

  // 算 canEdit：owner 或 list_members.role='co_owner'
  let canEdit = listRow?.owner_id === user.id;
  if (!canEdit) {
    const { data: member } = await supabase
      .from("list_members")
      .select("role")
      .eq("list_id", listId)
      .eq("user_id", user.id)
      .maybeSingle<{ role: "co_owner" | "viewer" }>();
    canEdit = member?.role === "co_owner";
  }

  // 共享 list 上的造访记录可能来自多个用户。拉非当前用户的 profiles 做名字映射。
  const otherVisitUserIds = new Set<string>();
  for (const log of logs) {
    if (log.user_id && log.user_id !== user.id) otherVisitUserIds.add(log.user_id);
  }
  let visitAuthors: Record<string, string> = {};
  if (otherVisitUserIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", Array.from(otherVisitUserIds));
    visitAuthors = Object.fromEntries(
      (profs ?? []).map((p) => [
        p.id,
        p.name ?? p.email.split("@")[0] ?? "（未知）",
      ]),
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <Link
        href={`/lists/${listId}`}
        className="mb-5 inline-flex items-center text-sm text-zinc-500 transition-colors hover:text-[var(--text-strong)]"
      >
        ‹ 返回所在 list
      </Link>
      <div className="mb-6 flex items-start justify-between gap-3">
        <h1 className="heading-display text-3xl">
          {canEdit ? "编辑店铺" : place.name}
        </h1>
        {canEdit && (
          <RecommendButton placeId={place.id} placeName={place.name} />
        )}
      </div>

      {!canEdit && (
        <div className="card mb-4 px-4 py-3 text-sm text-zinc-600">
          只读模式：你是这个 list 的查看者。要编辑请让 owner 把你升成共同所有者。
        </div>
      )}

      <PlaceForm
        mode="edit"
        listId={listId}
        place={place}
        currentUserId={user.id}
        readOnly={!canEdit}
      />

      <div className="mt-10 border-t border-[var(--border-subtle)] pt-6">
        <VisitHistory
          placeId={place.id}
          logs={logs}
          canEdit={canEdit}
          currentUserId={user.id}
          visitAuthors={visitAuthors}
        />
      </div>

      {canEdit && (
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
      )}
    </main>
  );
}
