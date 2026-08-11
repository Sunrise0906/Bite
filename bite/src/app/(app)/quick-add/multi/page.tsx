import Link from "next/link";
import { namesExistingInLists } from "@/lib/actions/place-lookup";
import { isPlaceDomain } from "@/lib/places/domain";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { readDraft } from "@/lib/actions/quick-add";
import { MultiPlaceList } from "@/components/places/multi-place-list";
import { RetryExtract } from "@/components/places/retry-extract";
import { InlineCreateList } from "@/components/lists/inline-create-list";
import { AlertIcon } from "@/components/ui/icons";
import type { ListOption } from "@/components/places/place-confirm-form";
import { signPhotoUrls } from "@/lib/storage/signed-photos";

export const metadata = {
  title: "合集帖 · Bite",
};

export default async function QuickAddMultiPage() {
  const user = await requireUser();
  const draft = await readDraft();

  if (!draft) redirect("/lists");
  if (draft.kind !== "multi") redirect("/quick-add");

  const supabase = await createClient();
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
        <InlineCreateList message="AI 已经从你的内容里识别出多家店，但你还没有可写的 list。建一个之后会自动回到这里继续。" />
      </main>
    );
  }

  // 查所有候选店在哪些 list 已存在（用于显示「已存在 · 将更新」）。
  // 归一化匹配，与写入同源；分组里放的是**候选自己的名字**，
  // 这样下游 existingNamesInList.has(p.name) 不必再关心库里那边写法有什么差别。
  const writableIds = writableLists.map((l) => l.id);
  const candidateNames = draft.places.map((p) => p.name);
  const hitsByName = await namesExistingInLists(candidateNames, writableIds);
  const existingByList: Record<string, string[]> = {};
  for (const [name, listIds] of Object.entries(hitsByName)) {
    for (const id of listIds) (existingByList[id] ??= []).push(name);
  }

  return (
    <main className="v2-page">
      <div className="v2-lhead" style={{ marginBottom: 14 }}>
        <Link href="/lists" className="v2-back">
          ‹ 取消并返回
        </Link>
        <div className="row1">
          <h1>合集帖 · 多店选择</h1>
        </div>
        <div className="stats">
          <span>每家店勾选后会作为独立条目添加到同一个 list</span>
        </div>
      </div>

      {draft.scrapeWarning && (
        <div
          className="mb-5 flex items-start gap-2 rounded-[0.875rem] border border-[var(--gold)]/30 bg-[var(--gold-soft)] px-3.5 py-2.5 text-sm text-[var(--gold-text)]"
          role="status"
        >
          <AlertIcon size={15} className="mt-0.5 shrink-0" />
          <span>{draft.scrapeWarning}</span>
        </div>
      )}

      <MultiPlaceList
        places={draft.places}
        lists={writableLists}
        // 目标清单来自草稿（从清单页发起时带上的），且必须在可写清单里才采纳
        defaultListId={
          writableLists.find((l) => l.id === draft.targetListId)?.id ??
          writableLists[0].id
        }
        sourceUrl={draft.sourceUrl}
        existingByList={existingByList}
        // 仅预览用（保存从 draft 读 canonical）；私有桶图换签名 URL
        photoUrls={await signPhotoUrls(supabase, draft.photoUrls ?? [])}
      />

      <div className="mt-8 border-t border-[var(--border-subtle)] pt-5">
        <RetryExtract initial={draft.rawInput} />
      </div>
    </main>
  );
}
