import Link from "next/link";
import type { Place } from "@/lib/db/types";
import { RenameListForm } from "@/components/lists/rename-list-form";
import { InviteButton } from "@/components/invites/invite-button";
import {
  ActiveInvitesPanel,
  type ActiveInvite,
} from "@/components/invites/active-invites";
import {
  MembersPanel,
  type MemberDisplay,
} from "@/components/lists/members-panel";
import { DeleteListButton } from "@/components/lists/delete-list-button";
import { LeaveListButton } from "@/components/lists/leave-list-button";
import { PlacesViewV2 } from "./places-view-v2";
import type { PlaceVisitSummary } from "@/components/places/places-view";

export function ListDetailV2({
  list,
  places,
  currentUserId,
  canEdit,
  isOwner,
  memberRole,
  ownerName,
  members,
  activeInvites,
  visitsByPlace,
}: {
  list: { id: string; name: string };
  places: Place[];
  currentUserId: string;
  canEdit: boolean;
  isOwner: boolean;
  memberRole: "co_owner" | "viewer" | null;
  ownerName: string | null;
  members: MemberDisplay[];
  activeInvites: ActiveInvite[];
  visitsByPlace: Record<string, PlaceVisitSummary>;
}) {
  const wantCount = places.filter((p) => p.status === "want_to_go").length;
  const visitedCount = places.filter((p) => p.status === "visited").length;

  return (
    <main className="v2-page">
      <div className="v2-lhead">
        <Link href="/lists" className="v2-back">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 5-7 7 7 7" />
          </svg>
          所有清单
        </Link>
        <div className="row1">
          {isOwner ? (
            <RenameListForm id={list.id} currentName={list.name} />
          ) : (
            <h1>{list.name}</h1>
          )}
          {isOwner && <InviteButton listId={list.id} />}
        </div>
        <div className="stats">
          <span>{places.length} 家店</span>
          {wantCount > 0 && <span>· 想去 {wantCount}</span>}
          {visitedCount > 0 && <span>· 去过 {visitedCount}</span>}
          {!isOwner && (
            <span
              className="v2-pill v2-pill-visited"
              style={{ padding: "2px 9px" }}
            >
              {memberRole === "co_owner" ? "共享 · 可编辑" : "共享 · 只读"}
              {ownerName ? ` · @${ownerName}` : ""}
            </span>
          )}
        </div>
      </div>

      {canEdit && (
        <Link
          href={`/lists/${list.id}/places/new`}
          className="v2-btn"
          style={{ width: "100%", padding: 13, margin: "8px 0 18px" }}
        >
          + 新增店铺
        </Link>
      )}

      {isOwner && members.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <MembersPanel listId={list.id} members={members} />
        </div>
      )}
      {isOwner && activeInvites.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <ActiveInvitesPanel invites={activeInvites} />
        </div>
      )}

      {places.length === 0 ? (
        <div className="v2-empty">
          <div className="t">这个清单还没有店</div>
          <div className="s">
            {canEdit ? "点上面「+ 新增店铺」加第一家" : "等所有者添加店铺"}
          </div>
        </div>
      ) : (
        <PlacesViewV2
          listId={list.id}
          places={places}
          currentUserId={currentUserId}
          visitsByPlace={visitsByPlace}
        />
      )}

      <section
        style={{
          marginTop: 36,
          borderTop: "1px solid var(--v2-border)",
          paddingTop: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className="v2-muted" style={{ fontSize: 13 }}>
          {isOwner ? "危险操作" : "不再关注"}
        </span>
        {isOwner ? (
          <DeleteListButton id={list.id} name={list.name} />
        ) : (
          <LeaveListButton listId={list.id} listName={list.name} />
        )}
      </section>
    </main>
  );
}
