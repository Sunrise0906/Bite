import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { readDraft } from "@/lib/actions/quick-add";
import { getPlaceDetails, inferCuisineFromTypes } from "@/lib/places/google";
import {
  PlaceConfirmForm,
  type InitialPlaceData,
  type ListOption,
} from "@/components/places/place-confirm-form";
import { RetryExtract } from "@/components/places/retry-extract";
import { InlineCreateList } from "@/components/lists/inline-create-list";
import type { ExtractedPlace } from "@/lib/llm/extract-place";

export const metadata = {
  title: "确认店铺 · Bite",
};

type SearchParams = Promise<{
  placeId?: string;
  sessionToken?: string;
  source?: string;
}>;

export default async function QuickAddPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { placeId, sessionToken } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  // 用户可写的 list：owner + 任何 list_members.role='co_owner'
  const [{ data: listsRows }, { data: memberships }] = await Promise.all([
    supabase
      .from("lists")
      .select("id, name, owner_id")
      .order("created_at", { ascending: true }),
    supabase
      .from("list_members")
      .select("list_id, role")
      .eq("user_id", user.id),
  ]);

  type ListRow = { id: string; name: string; owner_id: string };
  const allLists = (listsRows ?? []) as ListRow[];
  const coOwnerListIds = new Set(
    (memberships ?? [])
      .filter((m) => m.role === "co_owner")
      .map((m) => m.list_id),
  );
  const writableLists: ListOption[] = allLists
    .filter((l) => l.owner_id === user.id || coOwnerListIds.has(l.id))
    .map((l) => ({
      id: l.id,
      name: l.name,
      isOwner: l.owner_id === user.id,
    }));

  if (writableLists.length === 0) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <Link
          href="/lists"
          className="mb-5 inline-flex items-center text-sm text-zinc-500 transition-colors hover:text-[var(--text-strong)]"
        >
          ‹ 取消并返回
        </Link>
        <h1 className="heading-display mb-3 text-2xl">先建一个 list</h1>
        <InlineCreateList />
      </main>
    );
  }

  let initial: InitialPlaceData | null = null;
  let pageSource: "text" | "place" = "text";
  let confidence: ExtractedPlace["confidence"] | undefined;
  let fetchError: string | null = null;
  let scrapeWarning: string | null = null;
  let rawInputForRetry: string | null = null;

  if (placeId) {
    pageSource = "place";
    try {
      const details = await getPlaceDetails(placeId, sessionToken);
      initial = {
        name: details.name || "（未填）",
        address: details.formattedAddress || "（未填）",
        cuisine: inferCuisineFromTypes(details.primaryType, details.types),
        source: "google_places",
        google_place_id: details.placeId,
        lat: details.lat,
        lng: details.lng,
      };
      if (initial.cuisine.length === 0) initial.cuisine = ["餐厅"];
    } catch (err) {
      fetchError =
        "拉取 Google Places 详情失败：" +
        (err instanceof Error ? err.message : "未知错误") +
        "。常见原因：API key 加了 HTTP referrer 限制（服务端没 referrer），" +
        "或这三个 API 没在 Google Cloud Console 里启用：Maps JavaScript API / Places API (New) / Geocoding API。";
    }
  } else {
    pageSource = "text";
    const draft = await readDraft();
    if (!draft) redirect("/lists");
    if (draft.kind === "multi") redirect("/quick-add/multi");
    const ex = draft.extracted;
    initial = {
      name: ex.name,
      address: ex.address,
      cuisine: ex.cuisine,
      price_range: ex.price_range,
      status: ex.status,
      occasions: ex.occasions,
      recommended_by:
        ex.recommended_by ?? (draft.source === "xhs" ? "XHS博主" : undefined),
      tags: ex.tags,
      reason: ex.reason,
      source: draft.source,
      source_url: draft.sourceUrl,
      notes: ex.notes,
      photo_urls: draft.photoUrls,
    };
    confidence = ex.confidence;
    if (draft.scrapeWarning) scrapeWarning = draft.scrapeWarning;
    rawInputForRetry = draft.rawInput;
  }

  // 查同名已存在的 list（用于"已存在 → 覆盖更新"提示）
  let existingInLists: string[] = [];
  if (initial) {
    const writableIds = writableLists.map((l) => l.id);
    if (writableIds.length > 0) {
      const { data: dupes } = await supabase
        .from("places")
        .select("list_id")
        .eq("name", initial.name)
        .in("list_id", writableIds);
      existingInLists = ((dupes ?? []) as Array<{ list_id: string }>).map(
        (d) => d.list_id,
      );
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <Link
        href="/lists"
        className="mb-5 inline-flex items-center text-sm text-zinc-500 transition-colors hover:text-[var(--text-strong)]"
      >
        ‹ 取消并返回
      </Link>

      <h1 className="heading-display mb-2 text-3xl">确认店铺信息</h1>
      <p className="mb-6 text-sm text-zinc-500">
        检查字段、选择目标 list，然后保存
      </p>

      {fetchError && (
        <div className="alert-error mb-5" role="alert">
          {fetchError}
        </div>
      )}

      {scrapeWarning && (
        <div
          className="mb-5 rounded-xl border border-[var(--primary-soft)] bg-[var(--primary-soft)]/30 px-3 py-2.5 text-sm text-[var(--primary-soft-text)]"
          role="status"
        >
          ⚠️ {scrapeWarning}
        </div>
      )}

      {initial && (
        <PlaceConfirmForm
          initial={initial}
          lists={writableLists}
          defaultListId={writableLists[0].id}
          source={pageSource}
          confidence={confidence}
          existingInLists={existingInLists}
        />
      )}

      {rawInputForRetry && (
        <div className="mt-8 border-t border-[var(--border-subtle)] pt-5">
          <RetryExtract initial={rawInputForRetry} />
        </div>
      )}
    </main>
  );
}
