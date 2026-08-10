import { createClient, requireUser } from "@/lib/supabase/server";
import { signNestedPhotoUrls } from "@/lib/storage/signed-photos";
import { HomeV2, type DeckItem, type ListVM } from "@/components/v2/home-v2";

export const metadata = {
  title: "我的 list · Bite",
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

// ============================ 主页 ============================

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

  // 缩略图 / deck / 底图：自家 Storage 图换 signed URL（photos bucket 私有化）
  const allPlaces = lists.flatMap((l) => l.places ?? []);
  const signedGroups = await signNestedPhotoUrls(
    supabase,
    allPlaces.map((p) => p.photo_urls ?? []),
  );
  allPlaces.forEach((p, i) => {
    p.photo_urls = signedGroups[i];
  });

  // 共享成员：list_members + 相关 profiles（含 owner + 当前用户）
  const membersByList = new Map<string, string[]>();
  // 当前用户在每个共享清单里的角色 —— co_owner 能改名（sql/0019），viewer 不能
  const myRoleByList = new Map<string, string>();
  if (listIds.length > 0) {
    const { data: members } = await supabase
      .from("list_members")
      .select("list_id, user_id, role")
      .in("list_id", listIds);
    for (const m of (members ?? []) as Array<{
      list_id: string;
      user_id: string;
      role: string;
    }>) {
      const arr = membersByList.get(m.list_id) ?? [];
      arr.push(m.user_id);
      membersByList.set(m.list_id, arr);
      if (m.user_id === userId) myRoleByList.set(m.list_id, m.role);
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
      isOwner: l.owner_id === userId,
      // 能改名的人：owner 或 co_owner（删除仍只有 owner）
      canEdit:
        l.owner_id === userId || myRoleByList.get(l.id) === "co_owner",
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


  // 单一 UI：决策中枢主页（想去 deck + 清单行）。
  return renderHomeV2(user.id, supabase);
}
