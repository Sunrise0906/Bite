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
import type { ExtractedPlace } from "@/lib/llm/extract-place";

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

  // 用户可写的 list：owner + co_owner（v1 暂只查 owner）
  const { data: listsRows } = await supabase
    .from("lists")
    .select("id, name, owner_id")
    .order("created_at", { ascending: true });

  type ListRow = { id: string; name: string; owner_id: string };
  const allLists = (listsRows ?? []) as ListRow[];
  const writableLists: ListOption[] = allLists
    .filter((l) => l.owner_id === user.id)
    .map((l) => ({ id: l.id, name: l.name, isOwner: true }));

  if (writableLists.length === 0) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <div className="card p-6 text-center">
          <p className="text-sm text-zinc-600">
            你还没有可写的 list。先回去新建一个再来。
          </p>
          <Link
            href="/lists"
            className="btn-primary mt-4 inline-flex px-4 py-2 text-sm"
          >
            返回 lists
          </Link>
        </div>
      </main>
    );
  }

  let initial: InitialPlaceData | null = null;
  let pageSource: "text" | "place" = "text";
  let confidence: ExtractedPlace["confidence"] | undefined;
  let fetchError: string | null = null;

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
    const ex = draft.extracted;
    initial = {
      name: ex.name,
      address: ex.address,
      cuisine: ex.cuisine,
      price_range: ex.price_range,
      status: ex.status,
      occasions: ex.occasions,
      recommended_by: ex.recommended_by,
      tags: ex.tags,
      reason: ex.reason,
      source: "ai_extract",
      notes: ex.notes,
    };
    confidence = ex.confidence;
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

      {initial && (
        <PlaceConfirmForm
          initial={initial}
          lists={writableLists}
          defaultListId={writableLists[0].id}
          source={pageSource}
          confidence={confidence}
        />
      )}
    </main>
  );
}
