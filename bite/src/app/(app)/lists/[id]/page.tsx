import { notFound } from "next/navigation";
import { fetchDisplayNames, displayNameOf } from "@/lib/db/display-names";
import { isActive } from "@/lib/presence/active";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { List, Place } from "@/lib/db/types";
import {
  aggregateVisitSignals,
  type VisitLogRow,
  type VisitSignal,
} from "@/lib/visits/aggregate";
import type { ActiveInvite } from "@/components/invites/active-invites";
import type { MemberDisplay } from "@/components/lists/members-panel";
import { signNestedPhotoUrls } from "@/lib/storage/signed-photos";
import { ListDetailV2 } from "@/components/v2/list-detail-v2";

type Params = Promise<{ id: string }>;

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

export default async function ListDetailPage({ params }: { params: Params }) {
  const { id } = await params;

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

  // 卡片封面：自家 Storage 图换 signed URL（photos bucket 私有化）。
  // 本页只做展示；编辑页会重新拉 canonical，不受影响。
  const signedGroups = await signNestedPhotoUrls(
    supabase,
    places.map((p) => p.photo_urls ?? []),
  );
  places.forEach((p, i) => {
    p.photo_urls = signedGroups[i];
  });

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

  // 成员名单：**所有成员**都看得见（RLS 的 list_members_select 早就允许了，
  // 是应用层自己用 if (isOwner) 把它藏起来的）。两个人的清单里「还有谁」是显然的，
  // 三个人起就不是了 —— 而「@某人」「谁加的」「谁在线」全都以这个为前提。
  // 管理动作（改角色 / 移除）仍然只给 owner。
  const [{ data: invitesData }, { data: membersData }] = await Promise.all([
    // 邀请链接现在 co_owner 也能发（sql/0024），所以可写的人都该看到活跃链接
    canEdit
      ? supabase
          .from("list_invites")
          .select("token, role, expires_at")
          .eq("list_id", id)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as ActiveInvite[] }),
    supabase.from("list_members").select("user_id, role").eq("list_id", id),
  ]);
  const activeInvites = (invitesData ?? []) as ActiveInvite[];

  const memberRows = (membersData ?? []) as Array<{
    user_id: string;
    role: string;
  }>;
  const memberNames = await fetchDisplayNames(
    supabase,
    memberRows.map((m) => m.user_id),
  );
  // 谁刚刚还在。走 RPC 而不是直接 select profiles.last_seen_at ——
  // profiles 的 select 策略是 using(true)，把活跃时间放在列上等于全站可见，
  // 所以 0027 撤了那一列的读权限，只留这个「同清单成员」的函数。
  const { data: seenRows } = await supabase.rpc("list_member_activity", {
    p_list_id: id,
  });
  const seenMap = new Map(
    (
      (seenRows ?? []) as Array<{ user_id: string; last_seen_at: string | null }>
    ).map((r) => [r.user_id, r.last_seen_at]),
  );
  const members: MemberDisplay[] = memberRows.map((m) => ({
    user_id: m.user_id,
    role: m.role as "co_owner" | "viewer",
    display_name: displayNameOf(memberNames, m.user_id),
    active: isActive(seenMap.get(m.user_id)),
  }));

  // 单一 UI：清单详情（复用上面已算好的全部数据）
    return (
      <ListDetailV2
        list={{ id: list.id, name: list.name }}
        places={places}
        currentUserId={user.id}
        canEdit={canEdit}
        isOwner={isOwner}
        memberRole={memberRole}
        ownerName={ownerName}
        members={members}
        activeInvites={activeInvites}
        visitsByPlace={Object.fromEntries(visitsByPlace)}
        reasonAuthors={Object.fromEntries(reasonAuthors)}
      />
    );
}
