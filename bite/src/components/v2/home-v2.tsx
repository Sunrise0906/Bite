import Link from "next/link";
import { QuickAddInput } from "@/components/places/quick-add-input";
import { RandomPickButton } from "./random-pick-button";
import { DeckSection } from "./deck-section";

export type DeckItem = {
  placeId: string;
  listId: string;
  name: string;
  cuisine: string[];
  price: string | null;
  photo: string | null;
  reason: string | null;
};

export type ListVM = {
  id: string;
  name: string;
  count: number;
  wantCount: number;
  visitedCount: number;
  activityLabel: string;
  thumbs: string[];
  isShared: boolean;
  faces: Array<{ initial: string; sage: boolean }>;
};

type Props = {
  greetingName: string;
  initial: string;
  totalPlaces: number;
  totalWant: number;
  /** 决策中枢底图兜底：任意一张店铺封面（没 want_to_go 图时也有画面） */
  heroPhoto: string | null;
  deck: DeckItem[];
  lists: ListVM[];
};

const DEC = (
  <svg className="v2-svg" width="16" height="16" viewBox="0 0 24 24" style={{ stroke: "#fff" }}>
    <path d="M21 12a8 8 0 1 1-4-6.9L21 4l-1 4.5A8 8 0 0 1 21 12z" />
  </svg>
);

export function HomeV2({
  greetingName,
  initial,
  totalPlaces,
  totalWant,
  heroPhoto,
  deck,
  lists,
}: Props) {
  const hubBg = deck.find((d) => d.photo)?.photo ?? heroPhoto;

  return (
    <main className="v2-page">
      <div className="v2-top">
        <div className="hi">
          嘿
          <b>{greetingName}</b>
        </div>
        <span className="v2-ava" style={{ width: 38, height: 38, fontSize: 14 }}>
          {initial}
        </span>
      </div>

      {/* 统一加店入口（复用 V1 QuickAddInput，V2 换皮） */}
      <div style={{ marginBottom: 16 }}>
        <QuickAddInput />
      </div>

      {/* 决策中枢 */}
      <div className="v2-hub">
        {hubBg ? (
          <div className="bg" style={{ backgroundImage: `url('${hubBg}')` }} />
        ) : (
          <div
            className="bg"
            style={{ background: "linear-gradient(135deg,#c75b3a,#9c4226)" }}
          />
        )}
        <div className="scrim" />
        <div className="in">
          <div>
            <div className="eyebrow">
              <svg className="v2-svg" width="13" height="13" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4l3 2" />
              </svg>
              {totalPlaces} 家店 · 想去 {totalWant} 家
            </div>
            <h2>
              今晚，
              <br />
              吃哪一家？
            </h2>
          </div>
          <div className="row">
            <Link href="/chat" className="cta">
              {DEC}帮我决定
            </Link>
            <RandomPickButton
              picks={deck.map((d) => ({ listId: d.listId, placeId: d.placeId }))}
            />
          </div>
        </div>
      </div>

      {/* 想去 deck（有候选 → 带菜系筛选；没有 → 友好空提示） */}
      {deck.length > 0 ? (
        <DeckSection deck={deck} totalWant={totalWant} />
      ) : (
        lists.length > 0 && (
          <>
            <div className="v2-sec">
              <h3>想去 · 帮你前置了</h3>
            </div>
            <Link href="/chat" className="v2-lrow">
              <div className="li">
                <div className="nm">还没有「想去」的店</div>
                <div className="mt">加几家想去的，纠结时我帮你从里面挑</div>
              </div>
              <svg
                className="v2-svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                style={{ color: "var(--v2-faint)", flex: "none" }}
              >
                <path d="m9 5 7 7-7 7" />
              </svg>
            </Link>
          </>
        )
      )}

      {/* 我的清单 */}
      <div className="v2-sec">
        <h3>我的清单</h3>
        <span className="more">管理</span>
      </div>
      {lists.length === 0 ? (
        <div className="v2-empty">
          <div className="t">还没有清单</div>
          <div className="s">在上面输入个名字，比如「Irvine 想吃的」</div>
        </div>
      ) : (
        lists.map((l) => (
          <Link key={l.id} href={`/lists/${l.id}`} className="v2-lrow">
            {l.thumbs.length > 0 ? (
              <div className="v2-lthumbs">
                {l.thumbs.slice(0, 3).map((t, i) => (
                  <i key={i} style={{ backgroundImage: `url('${t}')` }} />
                ))}
              </div>
            ) : (
              <div className="v2-lthumbs">
                <i />
              </div>
            )}
            <div className="li">
              <div className="nm">
                {l.name}
                {l.isShared && (
                  <span className="v2-pill v2-pill-visited" style={{ padding: "2px 8px" }}>
                    共享
                  </span>
                )}
              </div>
              <div className="mt">
                {l.isShared && l.faces.length > 0 && (
                  <span className="v2-faces">
                    {l.faces.slice(0, 3).map((f, i) => (
                      <span key={i} className={`v2-ava${f.sage ? " sage" : ""}`}>
                        {f.initial}
                      </span>
                    ))}
                  </span>
                )}
                {l.isShared && <span className="v2-actdot" />}
                {l.activityLabel}
              </div>
            </div>
            <div className="cnt">{l.count}</div>
          </Link>
        ))
      )}
    </main>
  );
}
