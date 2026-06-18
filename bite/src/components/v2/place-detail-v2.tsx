import Link from "next/link";
import { VisitLogButton } from "@/components/visits/visit-log-button";

export type DetailPlace = {
  id: string;
  list_id: string;
  name: string;
  address: string;
  cuisine: string[];
  price_range: string | null;
  status: string;
  photo_urls: string[];
  reasons: Array<{ user_id: string; text: string }>;
  notes: string | null;
  lat: number | null;
  lng: number | null;
};

export type VisitSummary = {
  count: number;
  avgStar: number | null;
  lastSentiment: string | null;
  lastDate: string | null;
};

const STATUS = {
  want_to_go: { label: "想去", cls: "v2-pill-want" },
  visited: { label: "去过", cls: "v2-pill-visited" },
  archived: { label: "归档", cls: "v2-pill-visited" },
} as const;

const SENTIMENT: Record<string, string> = {
  will_return: "会再来",
  okay: "还行",
  wont_return: "不会再来",
};

function mapsUrl(p: DetailPlace): string {
  if (p.lat != null && p.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${p.name} ${p.address}`,
  )}`;
}

function Stars({ n }: { n: number }) {
  const full = Math.round(n);
  return (
    <span style={{ color: "var(--v2-gold)", letterSpacing: "1px" }}>
      {"★".repeat(full)}
      {"☆".repeat(Math.max(0, 5 - full))}
    </span>
  );
}

export function PlaceDetailV2({
  place,
  visits,
  reasonAuthors,
  currentUserId,
  canEdit,
  relDate,
}: {
  place: DetailPlace;
  visits: VisitSummary;
  reasonAuthors: Record<string, string>;
  currentUserId: string;
  canEdit: boolean;
  relDate: string | null;
}) {
  const st = STATUS[place.status as keyof typeof STATUS] ?? STATUS.want_to_go;
  const hero = place.photo_urls[0] ?? null;
  const myReason = place.reasons.find((r) => r.user_id === currentUserId);
  const otherReasons = place.reasons.filter(
    (r) => r.user_id !== currentUserId && r.text?.trim(),
  );
  const meta = [place.cuisine[0], place.price_range, place.address]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <main>
      {/* hero */}
      <div className="v2-hero">
        {hero ? (
          <div className="bg" style={{ backgroundImage: `url('${hero}')` }} />
        ) : (
          <div
            className="bg"
            style={{
              background: "linear-gradient(135deg,#e8cdb8,#d9b49a)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,.75)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M7 3v7a2 2 0 0 1-2 2M3 3v7a2 2 0 0 0 2 2m0 0v9M17 3c-1.7 0-3 2.2-3 5s1.3 5 3 5m0-10v18m0-8c1.7 0 3-2.2 3-5s-1.3-5-3-5" />
            </svg>
          </div>
        )}
        <div className="topbar">
          <Link href={`/lists/${place.list_id}`} className="ib">
            <svg className="v2-svg" width="18" height="18" viewBox="0 0 24 24">
              <path d="m15 5-7 7 7 7" />
            </svg>
          </Link>
          {place.photo_urls.length > 1 && (
            <span
              className="ib"
              style={{ width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 600 }}
            >
              1 / {place.photo_urls.length}
            </span>
          )}
        </div>
        <div className="grad" />
      </div>

      <div className="v2-dsheet" style={{ paddingBottom: 28 }}>
        <span className={`v2-pill ${st.cls}`}>{st.label}</span>
        <h1 className="v2-dname" style={{ marginTop: 9 }}>
          {place.name}
        </h1>
        {meta && <div className="v2-dmeta">{meta}</div>}

        {/* 回忆卡（去过才有） */}
        {visits.count > 0 && (
          <div className="v2-memory">
            <div className="t">
              <svg className="v2-svg" width="13" height="13" viewBox="0 0 24 24">
                <path d="M19.5 5.1a5 5 0 0 0-7.1 0L12 5.5l-.4-.4a5 5 0 1 0-7.1 7.1l7.5 7.5 7.5-7.5a5 5 0 0 0 0-7.1z" />
              </svg>
              你的回忆
            </div>
            <div className="stars">
              {visits.avgStar != null && <span className="big">{visits.avgStar.toFixed(1)}</span>}
              {visits.avgStar != null && <Stars n={visits.avgStar} />}
              <span className="v2-muted" style={{ fontSize: 12 }}>
                去过 {visits.count} 次
              </span>
            </div>
            <div className="sub">
              {relDate ? `最近一次 · ${relDate}` : "记录过造访"}
              {visits.lastSentiment && SENTIMENT[visits.lastSentiment]
                ? ` · ${SENTIMENT[visits.lastSentiment]}`
                : ""}
            </div>
          </div>
        )}

        {/* 我的理由 */}
        {myReason?.text?.trim() && (
          <div className="v2-reason">
            <span className="v2-ava ra">我</span>
            <div className="rt">
              <div className="who">我的理由</div>
              <div className="tx">{myReason.text}</div>
            </div>
          </div>
        )}
        {/* 别人的理由 */}
        {otherReasons.map((r, i) => {
          const who = reasonAuthors[r.user_id] ?? "朋友";
          return (
            <div className="v2-reason" key={i}>
              <span className="v2-ava ra sage">{who.slice(0, 1).toUpperCase()}</span>
              <div className="rt">
                <div className="who">@{who}</div>
                <div className="tx">{r.text}</div>
              </div>
            </div>
          );
        })}

        {/* AI 点评 */}
        {place.notes?.trim() && (
          <div className="v2-ainote">
            <div className="t">
              <svg className="v2-svg" width="13" height="13" viewBox="0 0 24 24">
                <path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7z" />
              </svg>
              Bite AI 点评
            </div>
            <div className="tx">{place.notes}</div>
          </div>
        )}

        {/* 操作 */}
        <div className="v2-dactions">
          {canEdit && <VisitLogButton placeId={place.id} variant="btn" />}
          <a className="v2-btn ghost" href={mapsUrl(place)} target="_blank" rel="noreferrer">
            <svg className="v2-svg" width="16" height="16" viewBox="0 0 24 24">
              <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            导航
          </a>
          {canEdit && (
            <Link
              className="v2-btn ghost"
              href={`/lists/${place.list_id}/places/${place.id}/edit`}
            >
              <svg className="v2-svg" width="16" height="16" viewBox="0 0 24 24">
                <path d="M17 3.5a2.1 2.1 0 0 1 3 3L8.5 18 4 19.5 5.5 15z" />
              </svg>
              编辑
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
