import { notFound, redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Place, VisitLog } from "@/lib/db/types";
import { getUiVersion } from "@/lib/ui-version";
import {
  aggregateVisitSignals,
  type VisitLogRow,
} from "@/lib/visits/aggregate";
import { relDate } from "@/lib/util/rel-date";
import { signPhotoUrls } from "@/lib/storage/signed-photos";
import { PlaceDetailV2 } from "@/components/v2/place-detail-v2";

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
  return { title: data?.name ? `${data.name} · Bite` : "店铺 · Bite" };
}

export default async function PlaceDetailPage({ params }: { params: Params }) {
  const { id: listId, placeId } = await params;

  // 详情页是 V2 专属；V1 回到原来的编辑页
  if ((await getUiVersion()) !== "v2") {
    redirect(`/lists/${listId}/places/${placeId}/edit`);
  }

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

  // 展示页：自家 Storage 图换 signed URL（外链原样）
  const displayPhotos = await signPhotoUrls(supabase, place.photo_urls ?? []);

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

  // 造访汇总
  const signals = aggregateVisitSignals(logs as unknown as VisitLogRow[]);
  const sig = signals.get(placeId);
  const visits = {
    count: sig?.count ?? 0,
    avgStar: sig?.avg_star ?? null,
    lastSentiment: sig?.last_sentiment ?? null,
    lastDate: sig?.last_visit ?? null,
  };
  const lastRel = visits.lastDate ? relDate(visits.lastDate) : null;

  // 理由作者（非当前用户）
  const reasons = (place.reasons ?? []) as Array<{
    user_id: string;
    text: string;
  }>;
  const otherIds = new Set<string>();
  for (const r of reasons)
    if (r.user_id && r.user_id !== user.id) otherIds.add(r.user_id);
  let reasonAuthors: Record<string, string> = {};
  if (otherIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", [...otherIds]);
    reasonAuthors = Object.fromEntries(
      (profs ?? []).map((p) => [
        p.id,
        p.name ?? p.email.split("@")[0] ?? "朋友",
      ]),
    );
  }

  return (
    <PlaceDetailV2
      place={{
        id: place.id,
        list_id: place.list_id,
        name: place.name,
        address: place.address,
        cuisine: place.cuisine ?? [],
        price_range: place.price_range,
        status: place.status,
        photo_urls: displayPhotos,
        reasons,
        notes: place.notes ?? null,
        dishes: place.dishes ?? [],
        source: place.source,
        source_url: place.source_url,
        google_rating: place.google_rating,
        google_rating_count: place.google_rating_count,
        google_maps_uri: place.google_maps_uri,
        lat: place.lat,
        lng: place.lng,
      }}
      visits={visits}
      reasonAuthors={reasonAuthors}
      currentUserId={user.id}
      canEdit={canEdit}
      relDate={lastRel}
    />
  );
}
