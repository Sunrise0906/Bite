import Link from "next/link";
import { CreateListForm } from "@/components/lists/create-list-form";
import { ListCardMenu } from "@/components/lists/list-card-menu";
import { QuickAddInput } from "@/components/places/quick-add-input";
import { createClient, requireUser } from "@/lib/supabase/server";

type ListRow = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  places: Array<{
    name: string;
    cuisine: string[];
    status: string;
    updated_at: string;
    created_at: string;
  }>;
};

const RELATIVE_DIVISIONS: Array<{ amount: number; name: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, name: "seconds" },
  { amount: 60, name: "minutes" },
  { amount: 24, name: "hours" },
  { amount: 7, name: "days" },
  { amount: 4.34524, name: "weeks" },
  { amount: 12, name: "months" },
  { amount: Number.POSITIVE_INFINITY, name: "years" },
];

function relativeTime(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat("zh", { numeric: "auto" });
  let duration = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.name);
    }
    duration /= division.amount;
  }
  return iso.slice(0, 10);
}

export default async function ListsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lists")
    .select(
      "id, name, owner_id, created_at, updated_at, places(name, cuisine, status, updated_at, created_at)",
    );

  // 按"最近活动"排序：取 list.updated_at + 其下所有 place.updated_at 的最大值。
  // 这样添了新店 / 改了店的 list 会自动顶到前面（GMail / ChatGPT 风格）。
  function maxActivity(l: ListRow): string {
    let m = l.updated_at;
    for (const p of l.places ?? []) {
      if (p.updated_at > m) m = p.updated_at;
    }
    return m;
  }
  const lists = ((data ?? []) as ListRow[])
    .slice()
    .sort((a, b) => maxActivity(b).localeCompare(maxActivity(a)));

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-7">
        <h1 className="heading-display text-3xl sm:text-4xl">我的 list</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          按用途分组管理你的餐厅收藏
        </p>
      </header>

      <div className="mb-5">
        <QuickAddInput />
      </div>

      <div className="mb-6">
        <CreateListForm />
      </div>

      {error && (
        <p role="alert" className="mb-4 alert-error">
          加载失败：{error.message}
        </p>
      )}

      {lists.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2.5">
          {lists.map((list) => (
            <li key={list.id}>
              <ListCard list={list} currentUserId={user.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ListCard({
  list,
  currentUserId,
}: {
  list: ListRow;
  currentUserId: string;
}) {
  const places = list.places ?? [];
  const total = places.length;
  const wantCount = places.filter((p) => p.status === "want_to_go").length;
  const visitedCount = places.filter((p) => p.status === "visited").length;

  // 最近添加
  const mostRecent = [...places].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];

  // top 菜系（出现频次最高的 1-2 个）
  const cuisineCount = new Map<string, number>();
  for (const p of places) {
    for (const c of p.cuisine) {
      cuisineCount.set(c, (cuisineCount.get(c) ?? 0) + 1);
    }
  }
  const topCuisines = Array.from(cuisineCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => c);

  // 上次更新时间：用 list.updated_at；如果有 place 更新时间更近，用最大值
  const lastUpdate = places.reduce(
    (max, p) => (p.updated_at > max ? p.updated_at : max),
    list.updated_at,
  );

  const isShared = list.owner_id !== currentUserId;
  const canDelete = !isShared; // owner only

  return (
    <article className="card relative">
      <Link
        href={`/lists/${list.id}`}
        className="card-interactive block px-4 py-3.5"
      >
        <div className="min-w-0 pr-8">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-base font-medium text-[var(--text-strong)]">
              {list.name}
            </span>
            {isShared && <span className="chip chip-neutral">共享</span>}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {total === 0 ? (
              "还没有店"
            ) : (
              <>
                <span className="text-[var(--text-default)]">{total}</span> 家
                {wantCount > 0 && (
                  <span className="ml-1.5">· 想去 {wantCount}</span>
                )}
                {visitedCount > 0 && (
                  <span className="ml-1.5">· 已去 {visitedCount}</span>
                )}
                {" · "}
                {relativeTime(lastUpdate)}
              </>
            )}
          </p>
          {topCuisines.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {topCuisines.map((c) => (
                <span key={c} className="chip chip-neutral">
                  {c}
                </span>
              ))}
            </div>
          )}
          {mostRecent && (
            <p className="mt-1.5 truncate text-xs italic text-zinc-500">
              最新：{mostRecent.name}
            </p>
          )}
        </div>
      </Link>
      {canDelete && (
        <div className="absolute right-2 top-2.5">
          <ListCardMenu
            listId={list.id}
            listName={list.name}
            placeCount={total}
          />
        </div>
      )}
    </article>
  );
}

function EmptyState() {
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
        <circle cx="32" cy="32" r="22" />
        <circle cx="32" cy="32" r="15" strokeDasharray="2 3" opacity="0.5" />
        <path d="M22 28c0-2.5 2-4 4-4M42 28c0-2.5-2-4-4-4" strokeLinecap="round" />
        <path d="M28 38c1.5 1.5 4 2 4 2s2.5-.5 4-2" strokeLinecap="round" />
      </svg>
      <p className="text-sm text-zinc-600">还没有 list</p>
      <p className="mt-1 text-xs text-zinc-500">
        在上面输入一个名字，比如「Irvine 想吃的」
      </p>
    </div>
  );
}
