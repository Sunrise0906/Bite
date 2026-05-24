import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { readDraft } from "@/lib/actions/quick-add";
import { MultiPlaceList } from "@/components/places/multi-place-list";
import { RetryExtract } from "@/components/places/retry-extract";
import type { ListOption } from "@/components/places/place-confirm-form";

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
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <Link
        href="/lists"
        className="mb-5 inline-flex items-center text-sm text-zinc-500 transition-colors hover:text-[var(--text-strong)]"
      >
        ‹ 取消并返回
      </Link>

      <h1 className="heading-display mb-2 text-3xl">合集帖 · 多店选择</h1>
      <p className="mb-6 text-sm text-zinc-500">
        每家店勾选后会作为独立条目添加到同一个 list
      </p>

      {draft.scrapeWarning && (
        <div
          className="mb-5 rounded-xl border border-[var(--primary-soft)] bg-[var(--primary-soft)]/30 px-3 py-2.5 text-sm text-[var(--primary-soft-text)]"
          role="status"
        >
          ⚠️ {draft.scrapeWarning}
        </div>
      )}

      <MultiPlaceList
        places={draft.places}
        lists={writableLists}
        defaultListId={writableLists[0].id}
        sourceUrl={draft.sourceUrl}
        existingByList={existingByList}
      />

      <div className="mt-8 border-t border-[var(--border-subtle)] pt-5">
        <RetryExtract initial={draft.rawInput} />
      </div>
    </main>
  );
}
