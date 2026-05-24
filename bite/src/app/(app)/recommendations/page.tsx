import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import { RecommendationCard } from "@/components/recommendations/recommendation-card";
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

  const [{ data: incoming }, { data: outgoing }, { data: ownLists }] =
    await Promise.all([
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
      supabase.from("lists").select("id, name").eq("owner_id", user.id),
    ]);

  const incomingRows = (incoming ?? []) as RecRow[];
  const outgoingRows = (outgoing ?? []) as RecRow[];
  const lists = (ownLists ?? []) as ListOption[];

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
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="heading-display text-3xl sm:text-4xl">收件箱</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          朋友推荐的店 · 你发出的推荐
        </p>
      </header>

      {/* ---- 收到的待处理 ---- */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          待处理 · 收到 {pendingIncoming.length}
        </h2>
        {pendingIncoming.length === 0 ? (
          <p className="card px-4 py-6 text-center text-sm text-zinc-500">
            没有待处理的推荐
          </p>
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            已处理 · 收到
          </h2>
          <ul className="space-y-2">
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            我发出的
          </h2>
          <ul className="space-y-2">
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
          <div className="card flex flex-col items-center px-6 py-10 text-center">
            <p className="text-sm text-zinc-600">还没有任何推荐</p>
            <p className="mt-1 text-xs text-zinc-500">
              在 list 里点店铺卡片可以推荐给朋友
            </p>
            <Link
              href="/lists"
              className="btn-secondary mt-4 px-4 py-2 text-xs"
            >
              去 lists
            </Link>
          </div>
        )}
    </main>
  );
}
