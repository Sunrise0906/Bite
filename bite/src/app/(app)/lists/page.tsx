import Link from "next/link";
import { CreateListForm } from "@/components/lists/create-list-form";
import { ListCardMenu } from "@/components/lists/list-card-menu";
import { QuickAddInput } from "@/components/places/quick-add-input";
import { ChevronRightIcon, UsersIcon } from "@/components/ui/icons";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getUiVersion } from "@/lib/ui-version";
import { HomeV2, type DeckItem, type ListVM } from "@/components/v2/home-v2";

export const metadata = {
  title: "我的 list · Bite",
};

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

// ============================ V2 主页 ============================

type V2Place = {
  id: string;
  name: string;
  cuisine: string[] | null;
  status: string;
  price_range: string | null;
  photo_urls: string[] | null;
  reasons: Array<{ user_id: string; text: string }> | null;
  updated_at: string;
  created_at: string;
};
type V2List = {
  id: string;
  name: string;
  owner_id: string;
  updated_at: string;
  places: V2Place[] | null;
};

async function renderHomeV2(
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data } = await supabase
    .from("lists")
    .select(
      "id, name, owner_id, updated_at, places(id, name, cuisine, status, price_range, photo_urls, reasons, updated_at, created_at)",
    );
  const lists = (data ?? []) as V2List[];
  const listIds = lists.map((l) => l.id);

  // 共享成员：list_members + 相关 profiles（含 owner + 当前用户）
  const membersByList = new Map<string, string[]>();
  if (listIds.length > 0) {
    const { data: members } = await supabase
      .from("list_members")
      .select("list_id, user_id")
      .in("list_id", listIds);
    for (const m of (members ?? []) as Array<{ list_id: string; user_id: string }>) {
      const arr = membersByList.get(m.list_id) ?? [];
      arr.push(m.user_id);
      membersByList.set(m.list_id, arr);
    }
  }
  const pids = new Set<string>([userId]);
  for (const l of lists) pids.add(l.owner_id);
  for (const arr of membersByList.values()) for (const u of arr) pids.add(u);
  const nameById = new Map<string, string>();
  if (pids.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", [...pids]);
    for (const p of (profs ?? []) as Array<{ id: string; name: string | null; email: string }>) {
      nameById.set(p.id, p.name ?? p.email?.split("@")[0] ?? "?");
    }
  }
  const initialOf = (id: string) =>
    (nameById.get(id) ?? "?").trim().slice(0, 1).toUpperCase();

  const maxActivity = (l: V2List) => {
    let m = l.updated_at;
    for (const p of l.places ?? []) if (p.updated_at > m) m = p.updated_at;
    return m;
  };
  const sorted = [...lists].sort((a, b) =>
    maxActivity(b).localeCompare(maxActivity(a)),
  );

  const listVMs: ListVM[] = sorted.map((l) => {
    const places = l.places ?? [];
    const memberIds = membersByList.get(l.id) ?? [];
    const isShared = l.owner_id !== userId || memberIds.length > 0;
    const faceIds = [l.owner_id, ...memberIds].filter(
      (v, i, a) => a.indexOf(v) === i,
    );
    return {
      id: l.id,
      name: l.name,
      count: places.length,
      wantCount: places.filter((p) => p.status === "want_to_go").length,
      visitedCount: places.filter((p) => p.status === "visited").length,
      activityLabel: relativeTime(maxActivity(l)),
      thumbs: places
        .filter((p) => (p.photo_urls?.length ?? 0) > 0)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((p) => p.photo_urls![0])
        .slice(0, 3),
      isShared,
      faces: faceIds
        .slice(0, 3)
        .map((id) => ({ initial: initialOf(id), sage: id !== userId })),
    };
  });

  const deckAll: DeckItem[] = [];
  for (const l of lists)
    for (const p of l.places ?? [])
      if (p.status === "want_to_go") {
        const myReason =
          (p.reasons ?? []).find((r) => r.user_id === userId)?.text ??
          (p.reasons ?? [])[0]?.text ??
          null;
        deckAll.push({
          placeId: p.id,
          listId: l.id,
          name: p.name,
          cuisine: p.cuisine ?? [],
          price: p.price_range,
          photo: p.photo_urls?.[0] ?? null,
          reason: myReason,
        });
      }
  // 有图的优先靠前，再按更近添加（保留插入顺序近似）
  deckAll.sort((a, b) => (b.photo ? 1 : 0) - (a.photo ? 1 : 0));
  const deck = deckAll.slice(0, 8);

  // 决策中枢底图兜底：任意一张店铺封面（即使没有 want_to_go 的图）
  let heroPhoto: string | null = null;
  for (const l of sorted) {
    for (const p of l.places ?? []) {
      if ((p.photo_urls?.length ?? 0) > 0) {
        heroPhoto = p.photo_urls![0];
        break;
      }
    }
    if (heroPhoto) break;
  }

  const totalPlaces = lists.reduce((n, l) => n + (l.places?.length ?? 0), 0);
  const totalWant = lists.reduce(
    (n, l) =>
      n + (l.places ?? []).filter((p) => p.status === "want_to_go").length,
    0,
  );

  return (
    <HomeV2
      greetingName={nameById.get(userId) ?? "你"}
      initial={initialOf(userId)}
      totalPlaces={totalPlaces}
      totalWant={totalWant}
      heroPhoto={heroPhoto}
      deck={deck}
      lists={listVMs}
    />
  );
}

export default async function ListsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // V2 新版主页（决策中枢 + 想去 deck + 清单行）。V1 默认，不受影响。
  if ((await getUiVersion()) === "v2") {
    return renderHomeV2(user.id, supabase);
  }

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

  // 拉共享 list 的 owner 名字（不是当前用户 owns 的就需要）
  const sharedOwnerIds = Array.from(
    new Set(
      lists.filter((l) => l.owner_id !== user.id).map((l) => l.owner_id),
    ),
  );
  const ownerNames: Record<string, string> = {};
  if (sharedOwnerIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", sharedOwnerIds);
    for (const p of profs ?? []) {
      ownerNames[p.id] = p.name ?? p.email.split("@")[0] ?? "（未知）";
    }
  }

  const totalPlaces = lists.reduce((n, l) => n + (l.places?.length ?? 0), 0);
  const totalWant = lists.reduce(
    (n, l) => n + (l.places ?? []).filter((p) => p.status === "want_to_go").length,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-7 sm:py-12">
      <header className="mb-8">
        <h1 className="heading-display text-[2rem] leading-tight sm:text-4xl">
          今天吃啥，<em className="italic text-[var(--primary)]">从这里挑</em>
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {lists.length === 0
            ? "建一个 list，把想吃的店都收进来"
            : `${lists.length} 个清单 · ${totalPlaces} 家店${totalWant > 0 ? ` · ${totalWant} 家还没去过` : ""}`}
        </p>
      </header>

      <div className="mb-4">
        <QuickAddInput />
      </div>

      <div className="mb-8">
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
        <>
          <div className="section-heading mb-3">
            <h2 className="text-xl">我的清单</h2>
          </div>
          <ul className="space-y-3">
            {lists.map((list) => (
              <li key={list.id}>
                <ListCard
                  list={list}
                  currentUserId={user.id}
                  ownerName={
                    list.owner_id === user.id
                      ? null
                      : (ownerNames[list.owner_id] ?? null)
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function ListCard({
  list,
  currentUserId,
  ownerName,
}: {
  list: ListRow;
  currentUserId: string;
  ownerName: string | null;
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
        className="card-interactive flex items-center gap-4 px-5 py-4"
      >
        {/* 左侧：店数（serif 大数字） */}
        <div className="flex w-12 shrink-0 flex-col items-center">
          <span className="heading-display text-[1.75rem] leading-none text-[var(--text-strong)]">
            {total}
          </span>
          <span className="mt-1 text-[10px] font-medium tracking-wide text-[var(--text-faint)]">
            家店
          </span>
        </div>

        <div className="min-w-0 flex-1 border-l border-[var(--border-subtle)] pl-4 pr-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[15px] font-semibold text-[var(--text-strong)]">
              {list.name}
            </span>
            {isShared && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[var(--sage-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--sage-text)]"
                title={ownerName ? `这个 list 属于 @${ownerName}` : undefined}
              >
                <UsersIcon size={11} />
                {ownerName ? `共享 · @${ownerName}` : "共享"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {total === 0 ? (
              "还没有店——点进去加第一家"
            ) : (
              <>
                {wantCount > 0 && <span>想去 {wantCount}</span>}
                {wantCount > 0 && visitedCount > 0 && <span> · </span>}
                {visitedCount > 0 && <span>已去 {visitedCount}</span>}
                {(wantCount > 0 || visitedCount > 0) && " · "}
                {relativeTime(lastUpdate)}
              </>
            )}
          </p>
          {(topCuisines.length > 0 || mostRecent) && (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
              {topCuisines.map((c) => (
                <span key={c} className="tag tag-neutral">
                  {c}
                </span>
              ))}
              {mostRecent && (
                <span className="min-w-0 truncate text-xs text-[var(--text-faint)]">
                  最新 · {mostRecent.name}
                </span>
              )}
            </div>
          )}
        </div>

        <ChevronRightIcon
          size={16}
          className="shrink-0 text-[var(--text-faint)]"
        />
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
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <svg
        aria-hidden="true"
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mb-5 text-[var(--primary)]"
      >
        <circle cx="32" cy="32" r="22" />
        <circle cx="32" cy="32" r="15" strokeDasharray="2 3" opacity="0.5" />
        <path d="M22 28c0-2.5 2-4 4-4M42 28c0-2.5-2-4-4-4" strokeLinecap="round" />
        <path d="M28 38c1.5 1.5 4 2 4 2s2.5-.5 4-2" strokeLinecap="round" />
      </svg>
      <p className="heading-display text-lg text-[var(--text-strong)]">
        还没有 list
      </p>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">
        在上面输入一个名字，比如「Irvine 想吃的」
      </p>
    </div>
  );
}
