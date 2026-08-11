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
import { QuickAddInput } from "@/components/places/quick-add-input";
import type { VisitSignal } from "@/lib/visits/aggregate";

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
  reasonAuthors,
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
  visitsByPlace: Record<string, VisitSignal>;
  /** user_id → 显示名，用来给共享清单里别人写的理由标作者 */
  reasonAuthors?: Record<string, string>;
}) {
  const wantCount = places.filter((p) => p.status === "want_to_go").length;
  const visitedCount = places.filter((p) => p.status === "visited").length;

  return (
    <main className="v2-page v2-page-wide">
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
          {/* 改名：owner 或 co_owner（sql/0019）。viewer 只看标题 */}
          {canEdit ? (
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

      {/* 智能添加：粘小红书链接 / 写几句话 / 拍照 / 搜店名，直接进这个清单。
          此前它只挂在主页，从清单里加店就只剩 /places/new 那个纯手填表单，
          想用小红书导入得先回主页、加完再在确认页手动挑回这个清单。
          defaultListId 会一路带到确认页做预选（确认页仍会校验可写并允许改）。 */}
      {canEdit && (
        <div style={{ margin: "8px 0 10px" }}>
          <QuickAddInput defaultListId={list.id} />
        </div>
      )}

      <div style={{ display: "flex", gap: 9, margin: "8px 0 18px" }}>
        {canEdit && (
          <Link
            href={`/lists/${list.id}/places/new`}
            className="v2-btn ghost"
            style={{ flex: 1, padding: 13 }}
          >
            手动填写
          </Link>
        )}
        {/* 从这个清单里问 AI —— /chat?list=<id> 会把作用域带过去，
            AI 默认只在这个清单里挑（见 api/chat 的「清单作用域」段）。 */}
        {places.length > 0 && (
          <Link
            href={`/chat?list=${list.id}`}
            className="v2-btn"
            style={{ flex: 1, padding: 13 }}
            title="只从这个清单里帮你选"
          >
            <svg className="v2-svg" width="15" height="15" viewBox="0 0 24 24">
              <path d="M21 12a8 8 0 1 1-4-6.9L21 4l-1 4.5A8 8 0 0 1 21 12z" />
            </svg>
            帮我从这挑
          </Link>
        )}
        {wantCount >= 2 && (
          <Link
            href={`/lists/${list.id}/pick`}
            className="v2-btn sage"
            style={{ flex: 1, padding: 13 }}
            title="滑卡选店：两个人都右滑同一家，就它了"
          >
            <svg className="v2-svg" width="15" height="15" viewBox="0 0 24 24">
              <path d="M19.5 5.1a5 5 0 0 0-7.1 0L12 5.5l-.4-.4a5 5 0 1 0-7.1 7.1l7.5 7.5 7.5-7.5a5 5 0 0 0 0-7.1z" />
            </svg>
            一起选
          </Link>
        )}
      </div>

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
            {canEdit
              ? "在上面粘个小红书链接、写几句话，或直接搜店名"
              : "等所有者添加店铺"}
          </div>
        </div>
      ) : (
        <PlacesViewV2
          listId={list.id}
          places={places}
          currentUserId={currentUserId}
          canEdit={canEdit}
          visitsByPlace={visitsByPlace}
          reasonAuthors={reasonAuthors}
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
