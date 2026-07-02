import Link from "next/link";
import { VisitLogButton } from "@/components/visits/visit-log-button";
import type { VisitPrefill } from "@/components/visits/visit-log-form";
import type { OpeningInfo } from "@/lib/places/google";
import { menuSearchUrl } from "@/lib/places/menu-url";

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
  dishes: string[];
  source: string;
  source_url: string | null;
  google_rating: number | null;
  google_rating_count: number | null;
  google_maps_uri: string | null;
  lat: number | null;
  lng: number | null;
};

const SOURCE_LABEL: Record<string, string> = {
  xhs: "小红书",
  google_places: "Google",
  ai_extract: "AI 提取",
  yelp: "Yelp",
  manual: "手动添加",
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
  visitPrefill,
  opening,
}: {
  place: DetailPlace;
  visits: VisitSummary;
  reasonAuthors: Record<string, string>;
  currentUserId: string;
  canEdit: boolean;
  relDate: string | null;
  /** 重访预填（自己上次造访的 sentiment/星级/同伴） */
  visitPrefill?: VisitPrefill;
  /** 实时营业状态（Google，best-effort，null = 不显示） */
  opening?: OpeningInfo | null;
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
              background:
                "linear-gradient(135deg,var(--v2-surface2),var(--v2-sunken))",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--v2-faint)"
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

        {/* 实时营业状态（有 google_place_id 且查询成功才显示） */}
        {opening?.open_now != null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 9,
              flexWrap: "wrap",
            }}
          >
            <span
              className={`v2-pill ${opening.open_now ? "v2-pill-visited" : "v2-pill-mute"}`}
            >
              {opening.open_now ? "营业中" : "已打烊"}
            </span>
            {opening.today && (
              <span className="v2-muted" style={{ fontSize: 12 }}>
                {opening.today}
              </span>
            )}
          </div>
        )}

        {/* Google 口碑 */}
        {place.google_rating != null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              marginTop: 12,
            }}
          >
            <span
              className="v2-disp"
              style={{ fontSize: 20, color: "var(--v2-ink)" }}
            >
              {place.google_rating.toFixed(1)}
            </span>
            <Stars n={place.google_rating} />
            {place.google_rating_count != null && (
              <span className="v2-muted" style={{ fontSize: 12 }}>
                {place.google_rating_count.toLocaleString()} 条评价
              </span>
            )}
            <a
              href={place.google_maps_uri ?? mapsUrl(place)}
              target="_blank"
              rel="noreferrer"
              style={{
                marginLeft: "auto",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--v2-muted)",
                border: "var(--v2-bw) solid var(--v2-border2)",
                borderRadius: 999,
                padding: "3px 10px",
              }}
            >
              Google ›
            </a>
          </div>
        )}

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

        {/* 招牌菜 / 网友推荐的菜 */}
        {place.dishes.length > 0 && (
          <div style={{ marginTop: 15 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--v2-gold-tx)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 9,
              }}
            >
              <svg className="v2-svg" width="13" height="13" viewBox="0 0 24 24">
                <path d="M7 3v7a2 2 0 0 1-2 2M3 3v7a2 2 0 0 0 2 2m0 0v9M17 3c-1.7 0-3 2.2-3 5s1.3 5 3 5m0-10v18" />
              </svg>
              招牌 · 网友推荐的菜
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {place.dishes.map((d, i) => (
                <span
                  key={i}
                  className="v2-tag"
                  style={{
                    background: "var(--v2-gold-soft)",
                    color: "var(--v2-gold-tx)",
                    padding: "5px 11px",
                    fontSize: 13,
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 来源 */}
        {(place.source_url || SOURCE_LABEL[place.source]) && (
          <div
            className="v2-muted"
            style={{ marginTop: 15, fontSize: 12, display: "flex", gap: 6 }}
          >
            来源：{SOURCE_LABEL[place.source] ?? place.source}
            {place.source_url && (
              <a
                href={place.source_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "var(--v2-link)",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                看原帖 ›
              </a>
            )}
          </div>
        )}

        {/* 看菜单（最显眼的主行动） */}
        <a
          className="v2-btn"
          href={menuSearchUrl(place.name, place.address)}
          target="_blank"
          rel="noreferrer"
          style={{ width: "100%", padding: 13, marginTop: 16 }}
        >
          {/* stroke 走 currentColor：跟随按钮的 --v2-on-primary */}
          <svg className="v2-svg" width="17" height="17" viewBox="0 0 24 24">
            <path d="M5 3h11a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2z" />
            <path d="M8 7h6M8 11h6M8 15h4" />
          </svg>
          看这家的菜单
        </a>

        {/* 操作 */}
        <div className="v2-dactions">
          {canEdit && (
            <VisitLogButton
              placeId={place.id}
              variant="btn"
              prefill={visitPrefill}
            />
          )}
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
