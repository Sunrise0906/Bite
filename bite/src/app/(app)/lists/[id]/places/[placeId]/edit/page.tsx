import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Place, VisitLog } from "@/lib/db/types";
import { PlaceForm } from "@/components/places/place-form";
import { DeletePlaceButton } from "@/components/places/delete-place-button";
import { VisitHistory } from "@/components/visits/visit-history";
import { RecommendButton } from "@/components/recommendations/recommend-button";
import { buildPhotoDisplayMap } from "@/lib/storage/signed-photos";

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

/** lucide 风格 eye（只读提示用，icons.tsx 暂缺） */
function EyeIcon({ size = 16, className }: { size?: number; className?: string }) {
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
      className={className}
      aria-hidden
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
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

  // 编辑页表单存 canonical URL；img 预览需要 canonical → signed 映射
  // （覆盖店铺图 + 所有造访记录图）。photos bucket 私有化后 canonical 打不开。
  const photoDisplayMap = await buildPhotoDisplayMap(supabase, [
    ...(place.photo_urls ?? []),
    ...logs.flatMap((l) => l.photos ?? []),
  ]);

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
    <main className="mx-auto w-full max-w-xl px-5 py-7 sm:py-12">
      <Link
        href={`/lists/${listId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
      >
        <ChevronLeftIcon size={15} />
        返回所在 list
      </Link>
      <div className="mb-8 flex items-start justify-between gap-3">
        <h1 className="heading-display text-3xl">
          {canEdit ? "编辑店铺" : place.name}
        </h1>
        {canEdit && (
          <RecommendButton placeId={place.id} placeName={place.name} />
        )}
      </div>

      {!canEdit && (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3">
          <EyeIcon
            size={16}
            className="mt-0.5 shrink-0 text-[var(--text-muted)]"
          />
          <div className="text-sm">
            <p className="font-medium text-[var(--text-strong)]">只读模式</p>
            <p className="mt-0.5 text-[var(--text-muted)]">
              你是这个 list 的查看者。要编辑请让 owner 把你升成共同所有者。
            </p>
          </div>
        </div>
      )}

      <PlaceForm
        mode="edit"
        listId={listId}
        place={place}
        currentUserId={user.id}
        readOnly={!canEdit}
        photoDisplayMap={photoDisplayMap}
      />

      <div className="mt-12 border-t border-[var(--border-subtle)] pt-8">
        <VisitHistory
          placeId={place.id}
          logs={logs}
          canEdit={canEdit}
          currentUserId={user.id}
          visitAuthors={visitAuthors}
          photoDisplayMap={photoDisplayMap}
        />
      </div>

      {canEdit && (
        <div className="mt-12 border-t border-[var(--border-subtle)] pt-8">
          <div className="section-heading mb-3">
            <h2 className="text-lg text-[var(--danger-text)]">危险操作</h2>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[var(--surface-elevated)] px-5 py-4">
            <p className="text-sm text-[var(--text-muted)]">
              删除后店铺与造访记录无法恢复
            </p>
            <DeletePlaceButton
              placeId={place.id}
              listId={listId}
              name={place.name}
            />
          </div>
        </div>
      )}
    </main>
  );
}
