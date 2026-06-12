import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { List, Place } from "@/lib/db/types";
import {
  aggregateVisitSignals,
  type VisitLogRow,
  type VisitSignal,
} from "@/lib/visits/aggregate";
import { RenameListForm } from "@/components/lists/rename-list-form";
import { DeleteListButton } from "@/components/lists/delete-list-button";
import { PlacesView } from "@/components/places/places-view";
import { InviteButton } from "@/components/invites/invite-button";
import {
  ActiveInvitesPanel,
  type ActiveInvite,
} from "@/components/invites/active-invites";
import {
  MembersPanel,
  type MemberDisplay,
} from "@/components/lists/members-panel";
import { LeaveListButton } from "@/components/lists/leave-list-button";
import { UsersIcon } from "@/components/ui/icons";
import { safeDecodeURIComponent } from "@/lib/url/safe-decode";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string; toast?: string }>;

export async function generateMetadata(props: { params: Params }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("lists")
    .select("name")
    .eq("id", id)
    .maybeSingle<{ name: string }>();
  return {
    title: data?.name ? `${data.name} · Bite` : "List · Bite",
  };
}

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { error: errorParam } = await searchParams;

  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: list, error: listErr }, { data: placesData }] =
    await Promise.all([
      supabase
        .from("lists")
        .select("*")
        .eq("id", id)
        .maybeSingle<List>(),
      supabase
        .from("places")
        .select("*")
        .eq("list_id", id)
        .order("updated_at", { ascending: false }),
    ]);

  // 查询本身失败（网络 / DB 故障）要走 error.tsx 给重试，而不是误报 404
  if (listErr) throw new Error(`加载 list 失败：${listErr.message}`);
  if (!list) notFound();

  const places = (placesData ?? []) as Place[];

  // 共享 list 才有意义 fetch profiles：personal list 上所有 reasons 都是 owner 自己的，
  // 不显示作者标签更简洁。memberRole != null 或 owner 有共同所有者 / 查看者时才查。
  // 简化：所有非空 reasons 的 user_id 都查一次（cost 低）。
  // 同时把 list owner 加进 lookup（用于显示 "by @owner" 给非 owner 用户看）。
  const profileLookupIds = new Set<string>();
  for (const p of places) {
    for (const r of p.reasons ?? []) {
      if (r.user_id && r.user_id !== user.id) profileLookupIds.add(r.user_id);
    }
  }
  if (list.owner_id !== user.id) profileLookupIds.add(list.owner_id);

  const profilesMap = new Map<string, string>();
  if (profileLookupIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", Array.from(profileLookupIds));
    for (const p of profs ?? []) {
      profilesMap.set(
        p.id,
        p.name ?? p.email.split("@")[0] ?? "（未知）",
      );
    }
  }
  const reasonAuthors = profilesMap;
  const ownerName = profilesMap.get(list.owner_id) ?? null;

  // 拉这些 places 的 visit_logs 摘要：count + last sentiment + last date + avg star
  // 聚合逻辑抽到 aggregateVisitSignals（纯函数，有单测；chat-tools 也共用同一份）
  let visitsByPlace = new Map<string, VisitSignal>();
  if (places.length > 0) {
    const placeIds = places.map((p) => p.id);
    const { data: visitRows } = await supabase
      .from("visit_logs")
      .select("place_id, visited_at, sentiment, star_rating")
      .in("place_id", placeIds)
      .order("visited_at", { ascending: false });
    visitsByPlace = aggregateVisitSignals((visitRows ?? []) as VisitLogRow[]);
  }
  const isOwner = list.owner_id === user.id;

  // 不是 owner 时查 list_members 里的角色
  let memberRole: "co_owner" | "viewer" | null = null;
  if (!isOwner) {
    const { data: member } = await supabase
      .from("list_members")
      .select("role")
      .eq("list_id", id)
      .eq("user_id", user.id)
      .maybeSingle<{ role: "co_owner" | "viewer" }>();
    memberRole = member?.role ?? null;
  }
  // 能编辑 = owner 或 co_owner
  const canEdit = isOwner || memberRole === "co_owner";

  // owner 看自己发的活跃邀请（未用 + 未过期）+ 当前成员列表
  let activeInvites: ActiveInvite[] = [];
  let members: MemberDisplay[] = [];
  if (isOwner) {
    const [{ data: invitesData }, { data: membersData }] = await Promise.all([
      supabase
        .from("list_invites")
        .select("token, role, expires_at")
        .eq("list_id", id)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("list_members")
        .select("user_id, role")
        .eq("list_id", id),
    ]);
    activeInvites = (invitesData ?? []) as ActiveInvite[];

    // 拉 profiles 做名字映射
    const memberUserIds = (membersData ?? []).map((m) => m.user_id);
    let profilesMap = new Map<string, { name: string | null; email: string }>();
    if (memberUserIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", memberUserIds);
      profilesMap = new Map(
        (profs ?? []).map((p) => [p.id, { name: p.name, email: p.email }]),
      );
    }
    members = (membersData ?? []).map((m) => {
      const p = profilesMap.get(m.user_id);
      return {
        user_id: m.user_id,
        role: m.role as "co_owner" | "viewer",
        display_name: p?.name ?? p?.email.split("@")[0] ?? "（未知）",
      };
    });
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-7 sm:py-12">
      <Link
        href="/lists"
        className="mb-5 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 5-7 7 7 7" />
        </svg>
        返回所有 list
      </Link>

      <header className="sticky top-0 z-20 -mx-5 mb-8 border-b border-[var(--border-subtle)] bg-[var(--background)]/90 px-5 py-3.5 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/70">
        <div className="flex items-start justify-between gap-3">
          {isOwner ? (
            <RenameListForm id={list.id} currentName={list.name} />
          ) : (
            <h1 className="heading-display text-2xl text-[var(--text-strong)] sm:text-3xl">
              {list.name}
            </h1>
          )}
          {isOwner && <InviteButton listId={list.id} />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
          <span>{places.length} 家店</span>
          {!isOwner && (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[var(--sage-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--sage-text)]"
                title={ownerName ? `这个 list 属于 @${ownerName}` : ""}
              >
                <UsersIcon size={11} />
                {memberRole === "co_owner" ? "共享 · 共同所有者" : "共享 · 只读"}
              </span>
              {ownerName && (
                <span className="text-xs text-[var(--text-faint)]">
                  by{" "}
                  <span className="font-medium text-[var(--text-default)]">
                    @{ownerName}
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      </header>

      {errorParam && (
        <p role="alert" className="mb-4 alert-error">
          {safeDecodeURIComponent(errorParam)}
        </p>
      )}

      {canEdit && (
        <div className="mb-8">
          <Link
            href={`/lists/${list.id}/places/new`}
            className="btn-primary w-full py-3 text-base"
          >
            + 新增店铺
          </Link>
        </div>
      )}

      {isOwner && members.length > 0 && (
        <MembersPanel listId={list.id} members={members} />
      )}

      {isOwner && activeInvites.length > 0 && (
        <ActiveInvitesPanel invites={activeInvites} />
      )}

      {places.length === 0 ? (
        <EmptyPlaces />
      ) : (
        <PlacesView
          places={places}
          currentUserId={user.id}
          canEdit={canEdit}
          visitsByPlace={Object.fromEntries(visitsByPlace)}
          reasonAuthors={Object.fromEntries(reasonAuthors)}
        />
      )}

      {isOwner ? (
        <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            设置
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-muted)]">危险操作</span>
            <DeleteListButton id={list.id} name={list.name} />
          </div>
        </section>
      ) : (
        <section className="mt-12 border-t border-[var(--border-subtle)] pt-6">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            成员操作
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-muted)]">不再关注</span>
            <LeaveListButton listId={list.id} listName={list.name} />
          </div>
        </section>
      )}
    </main>
  );
}

function EmptyPlaces() {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <svg
        aria-hidden="true"
        width="56"
        height="56"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mb-5 text-[var(--primary)]"
      >
        <ellipse cx="32" cy="34" rx="22" ry="6" />
        <path d="M10 34v4c0 3 10 6 22 6s22-3 22-6v-4" />
        <path d="M18 24v-6M28 22v-8M38 24v-6M46 22v-8" strokeLinecap="round" />
      </svg>
      <p className="heading-display text-lg text-[var(--text-strong)]">
        这个 list 还没有店铺
      </p>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">
        点上面 “+ 新增店铺” 添加一家
      </p>
    </div>
  );
}
