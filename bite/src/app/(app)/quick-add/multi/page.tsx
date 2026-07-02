import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { readDraft } from "@/lib/actions/quick-add";
import { MultiPlaceList } from "@/components/places/multi-place-list";
import { RetryExtract } from "@/components/places/retry-extract";
import { InlineCreateList } from "@/components/lists/inline-create-list";
import { AlertIcon } from "@/components/ui/icons";
import type { ListOption } from "@/components/places/place-confirm-form";
import { getUiVersion } from "@/lib/ui-version";

export const metadata = {
  title: "合集帖 · Bite",
};

export default async function QuickAddMultiPage() {
  const user = await requireUser();
  const v2 = (await getUiVersion()) === "v2";
  const draft = await readDraft();

  if (!draft) redirect("/lists");
  if (draft.kind !== "multi") redirect("/quick-add");

  const supabase = await createClient();
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
      <main className={v2 ? "v2-page" : "mx-auto w-full max-w-xl px-5 py-10"}>
        {v2 ? (
          <div className="v2-lhead">
            <Link href="/lists" className="v2-back">
              ‹ 取消并返回
            </Link>
            <div className="row1">
              <h1>先建一个 list</h1>
            </div>
          </div>
        ) : (
          <>
            <Link
              href="/lists"
              className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
            >
              ‹ 取消并返回
            </Link>
            <h1 className="heading-display mb-4 text-2xl">先建一个 list</h1>
          </>
        )}
        <InlineCreateList message="AI 已经从你的内容里识别出多家店，但你还没有可写的 list。建一个之后会自动回到这里继续。" />
      </main>
    );
  }

  // 查所有候选店在哪些 list 已存在（用于显示"已存在 · 将更新"）
  const writableIds = writableLists.map((l) => l.id);
  const candidateNames = draft.places.map((p) => p.name);
  let existingByList: Record<string, string[]> = {};
  if (writableIds.length > 0 && candidateNames.length > 0) {
    const { data: dupes } = await supabase
      .from("places")
      .select("list_id, name")
      .in("list_id", writableIds)
      .in("name", candidateNames);
    const grouped: Record<string, string[]> = {};
    for (const row of (dupes ?? []) as Array<{
      list_id: string;
      name: string;
    }>) {
      (grouped[row.list_id] ??= []).push(row.name);
    }
    existingByList = grouped;
  }

  return (
    <main className={v2 ? "v2-page" : "mx-auto w-full max-w-2xl px-5 py-6 sm:py-10"}>
      {v2 ? (
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
      ) : (
        <>
          <Link
            href="/lists"
            className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
          >
            ‹ 取消并返回
          </Link>

          <header className="mb-8">
            <h1 className="heading-display text-3xl">合集帖 · 多店选择</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              每家店勾选后会作为独立条目添加到同一个 list
            </p>
          </header>
        </>
      )}

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
        defaultListId={writableLists[0].id}
        sourceUrl={draft.sourceUrl}
        existingByList={existingByList}
        photoUrls={draft.photoUrls}
        v2={v2}
      />

      <div className="mt-8 border-t border-[var(--border-subtle)] pt-5">
        <RetryExtract initial={draft.rawInput} />
      </div>
    </main>
  );
}
