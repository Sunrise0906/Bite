import Link from "next/link";
import { listsWithSameName } from "@/lib/actions/place-lookup";
import { isPlaceDomain } from "@/lib/places/domain";
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
import { AlertIcon } from "@/components/ui/icons";
import type { ExtractedPlace } from "@/lib/llm/extract-place";
import { signPhotoUrls } from "@/lib/storage/signed-photos";

export const metadata = {
  title: "确认店铺 · Bite",
};

type SearchParams = Promise<{
  placeId?: string;
  sessionToken?: string;
  source?: string;
  /** 从某个清单页发起的店名搜索会带上它（文本/拍照路径走草稿里的 targetListId） */
  list?: string;
}>;

export default async function QuickAddPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { placeId, sessionToken, list: listFromQuery } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  // 用户可写的 list：owner + 任何 list_members.role='co_owner'
  const [{ data: listsRows }, { data: memberships }] = await Promise.all([
    supabase
      .from("lists")
      .select("id, name, owner_id, category")
      .order("created_at", { ascending: true }),
    supabase
      .from("list_members")
      .select("list_id, role")
      .eq("user_id", user.id),
  ]);

  type ListRow = { id: string; name: string; owner_id: string; category?: string };
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
      // 清单领域 → 确认页据此把「菜系」显示成「品类 / 类型」
      category: isPlaceDomain(l.category) ? l.category : undefined,
    }));

  // 目标清单：URL（店名搜索路径）或草稿（文本/小红书/拍照路径）。
  // ⚠️ 必须在 writableLists 里验一遍才用 —— 否则等于让 URL 参数指定写入目标。
  let requestedListId: string | undefined = listFromQuery || undefined;

  if (writableLists.length === 0) {
    return (
      <main className="v2-page">
        <div className="v2-lhead">
          <Link href="/lists" className="v2-back">
            ‹ 取消并返回
          </Link>
          <div className="row1">
            <h1>先建一个 list</h1>
          </div>
        </div>
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
        "或这两个 API 没在 Google Cloud Console 里启用：Maps JavaScript API / Places API (New)。";
    }
  } else {
    pageSource = "text";
    const draft = await readDraft();
    if (!draft) redirect("/lists");
    if (draft.kind === "multi") redirect("/quick-add/multi");
    requestedListId = requestedListId ?? draft.targetListId;
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
      dishes: ex.dishes,
      source: draft.source,
      source_url: draft.sourceUrl,
      notes: ex.notes,
      photo_urls: draft.photoUrls,
    };
    confidence = ex.confidence;
    if (draft.scrapeWarning) scrapeWarning = draft.scrapeWarning;
    rawInputForRetry = draft.rawInput;
  }

  // 查同名已存在的 list（用于「已存在 → 覆盖更新」提示）。
  // 走和写入同一套归一化匹配，否则提示和后端行为会分叉，见 lib/actions/place-lookup.ts
  const existingInLists = initial
    ? await listsWithSameName(initial.name, writableLists.map((l) => l.id))
    : [];

  return (
    <main className="v2-page">
      <div className="v2-lhead" style={{ marginBottom: 14 }}>
        <Link href="/lists" className="v2-back">
          ‹ 取消并返回
        </Link>
        <div className="row1">
          <h1>确认店铺信息</h1>
        </div>
        <div className="stats">
          <span>检查字段、选择目标 list，然后保存</span>
        </div>
      </div>

      {fetchError && (
        <div className="alert-error mb-5 flex items-start gap-2" role="alert">
          <AlertIcon size={15} className="mt-0.5 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {scrapeWarning && (
        <div
          className="mb-5 flex items-start gap-2 rounded-[0.875rem] border border-[var(--gold)]/30 bg-[var(--gold-soft)] px-3.5 py-2.5 text-sm text-[var(--gold-text)]"
          role="status"
        >
          <AlertIcon size={15} className="mt-0.5 shrink-0" />
          <span>{scrapeWarning}</span>
        </div>
      )}

      {initial && (
        <PlaceConfirmForm
          initial={initial}
          lists={writableLists}
          defaultListId={
            writableLists.find((l) => l.id === requestedListId)?.id ??
            writableLists[0].id
          }
          source={pageSource}
          confidence={confidence}
          existingInLists={existingInLists}
          // 拍照识店的图在私有桶：预览用签名 URL，hidden input 保持 canonical
          photoDisplayUrls={
            initial.photo_urls?.length
              ? await signPhotoUrls(supabase, initial.photo_urls)
              : undefined
          }
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
