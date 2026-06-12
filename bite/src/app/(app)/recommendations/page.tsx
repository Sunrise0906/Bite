import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import { RecommendationCard } from "@/components/recommendations/recommendation-card";
import { InboxIcon } from "@/components/ui/icons";
import type { SnapshottedPlace } from "@/lib/actions/recommendations";

export const metadata = {
  title: "收件箱 · Bite",
};

type RecRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  place_data: SnapshottedPlace;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  resolved_at: string | null;
};

type ListOption = { id: string; name: string };

export default async function RecommendationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [
    { data: incoming },
    { data: outgoing },
    { data: allLists },
    { data: memberships },
  ] = await Promise.all([
    supabase
      .from("recommendations")
      .select("*")
      .eq("to_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("recommendations")
      .select("*")
      .eq("from_user_id", user.id)
      .order("created_at", { ascending: false }),
    // 通过 RLS 拿所有用户可见的 lists（owner + member）
    supabase.from("lists").select("id, name, owner_id"),
    supabase
      .from("list_members")
      .select("list_id, role")
      .eq("user_id", user.id),
  ]);

  const incomingRows = (incoming ?? []) as RecRow[];
  const outgoingRows = (outgoing ?? []) as RecRow[];

  // 接受目标：owner 的 list + co_owner member 的 list（跟 /quick-add 行为一致）
  const coOwnerListIds = new Set(
    (memberships ?? [])
      .filter((m) => m.role === "co_owner")
      .map((m) => m.list_id),
  );
  type ListWithOwner = { id: string; name: string; owner_id: string };
  const lists: ListOption[] = ((allLists ?? []) as ListWithOwner[])
    .filter((l) => l.owner_id === user.id || coOwnerListIds.has(l.id))
    .map((l) => ({ id: l.id, name: l.name }));

  const pendingIncoming = incomingRows.filter((r) => r.status === "pending");
  const resolvedIncoming = incomingRows.filter((r) => r.status !== "pending");

  // 拿发送者 / 接收者的 profile（用于显示名字）
  const allUserIds = new Set<string>();
  for (const r of incomingRows) allUserIds.add(r.from_user_id);
  for (const r of outgoingRows) allUserIds.add(r.to_user_id);
  const profiles = new Map<string, { name: string | null; email: string }>();
  if (allUserIds.size > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", Array.from(allUserIds));
    for (const p of data ?? []) {
      profiles.set(p.id, { name: p.name, email: p.email });
    }
  }

  function labelOf(uid: string): string {
    const p = profiles.get(uid);
    if (!p) return "（未知）";
    return p.name ?? p.email.split("@")[0];
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-7 sm:py-10">
      <header className="mb-8">
        <h1 className="heading-display text-3xl sm:text-4xl">收件箱</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          朋友推荐的店 · 你发出的推荐
        </p>
      </header>

      {/* ---- 收到的待处理 ---- */}
      <section className="mb-8">
        <div className="section-heading mb-3">
          <h2 className="text-lg">待处理</h2>
          <span className="text-xs text-[var(--text-muted)]">
            收到 {pendingIncoming.length} 条
          </span>
        </div>
        {pendingIncoming.length === 0 ? (
          <div className="card flex flex-col items-center px-5 py-8 text-center">
            <InboxIcon size={24} className="mb-2 text-[var(--text-faint)]" />
            <p className="text-sm text-[var(--text-muted)]">
              没有待处理的推荐
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {pendingIncoming.map((r) => (
              <li key={r.id}>
                <RecommendationCard
                  rec={{
                    id: r.id,
                    place: r.place_data,
                    fromLabel: labelOf(r.from_user_id),
                    createdAt: r.created_at,
                    status: r.status,
                    direction: "incoming",
                  }}
                  ownLists={lists}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- 收到的已处理 ---- */}
      {resolvedIncoming.length > 0 && (
        <section className="mb-8">
          <div className="section-heading mb-3">
            <h2 className="text-lg">已处理</h2>
            <span className="text-xs text-[var(--text-muted)]">
              收到的推荐
            </span>
          </div>
          <ul className="space-y-3">
            {resolvedIncoming.map((r) => (
              <li key={r.id}>
                <RecommendationCard
                  rec={{
                    id: r.id,
                    place: r.place_data,
                    fromLabel: labelOf(r.from_user_id),
                    createdAt: r.created_at,
                    status: r.status,
                    direction: "incoming",
                  }}
                  ownLists={lists}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- 发出 ---- */}
      {outgoingRows.length > 0 && (
        <section>
          <div className="section-heading mb-3">
            <h2 className="text-lg">我发出的</h2>
          </div>
          <ul className="space-y-3">
            {outgoingRows.map((r) => (
              <li key={r.id}>
                <RecommendationCard
                  rec={{
                    id: r.id,
                    place: r.place_data,
                    fromLabel: labelOf(r.to_user_id),
                    createdAt: r.created_at,
                    status: r.status,
                    direction: "outgoing",
                  }}
                  ownLists={lists}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingIncoming.length === 0 &&
        resolvedIncoming.length === 0 &&
        outgoingRows.length === 0 && (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <InboxIcon size={32} className="mb-4 text-[var(--primary)]" />
            <p className="heading-display text-lg text-[var(--text-strong)]">
              还没有任何推荐
            </p>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              在 list 里点店铺卡片可以推荐给朋友
            </p>
            <Link
              href="/lists"
              className="btn-secondary mt-5 px-4 py-2 text-xs"
            >
              去 lists
            </Link>
          </div>
        )}
    </main>
  );
}
