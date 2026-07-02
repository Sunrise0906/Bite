"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  castPickVote,
  checkPickMatch,
  restartPickSession,
  type PickCard,
  type PickSessionData,
} from "@/lib/actions/pick";

// 「一起选」滑卡：右滑=想吃♥，左滑=跳过✗。两人都右滑同一家 → 就它了。
// 单人清单是快速筛选模式：滑完从右滑里随机挑一家。

type Matched = { place_id: string; name: string } | null;

export function PickDeck({ initial }: { initial: PickSessionData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [cards, setCards] = useState<PickCard[]>(initial.cards);
  const [likes, setLikes] = useState<string[]>(initial.my_likes);
  const [matched, setMatched] = useState<Matched>(
    initial.status === "done" && initial.matched_place_id
      ? { place_id: initial.matched_place_id, name: "" }
      : null,
  );
  const [pendingRestart, setPendingRestart] = useState(false);

  // 拖拽状态
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [flyDir, setFlyDir] = useState<"left" | "right" | null>(null);

  const top = cards[0] ?? null;
  const duo = data.member_count > 1;
  const finished = !top && !matched;

  // 滑完等对方：轮询匹配结果。session 被对方结束（再来一轮）时 place_id 为
  // null——refresh 重挂进新 session，不要让用户永远卡在等待页
  useEffect(() => {
    if (!finished || !duo || matched) return;
    const t = setInterval(async () => {
      const r = await checkPickMatch(data.session_id);
      if ("status" in r && r.status === "done") {
        if (r.place_id) {
          setMatched({ place_id: r.place_id, name: r.name ?? "这家店" });
        } else {
          router.refresh();
        }
      }
    }, 4000);
    return () => clearInterval(t);
  }, [finished, duo, matched, data.session_id, router]);

  async function vote(card: PickCard, yes: boolean) {
    if (flyDir) return; // 飞卡动画期间连点会对同一张卡重复投票
    setFlyDir(yes ? "right" : "left");
    // 飞出动画后移除
    setTimeout(() => {
      setCards((prev) => prev.filter((c) => c.place_id !== card.place_id));
      setFlyDir(null);
      setDrag(null);
    }, 220);
    if (yes) setLikes((prev) => [...prev, card.place_id]);
    const r = await castPickVote(data.session_id, card.place_id, yes);
    if ("error" in r) {
      // 票没落库（session 被结束 / 0014 未跑）：回滚本地计数并提示
      if (yes) setLikes((prev) => prev.filter((id) => id !== card.place_id));
      toast.error(`这一票没记上：${r.error}`);
      return;
    }
    if (r.matched) setMatched(r.matched);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (flyDir) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current || flyDir) return;
    setDrag({
      dx: e.clientX - dragStart.current.x,
      dy: e.clientY - dragStart.current.y,
    });
  }
  function onPointerUp() {
    if (!dragStart.current || !top || flyDir) return;
    const dx = drag?.dx ?? 0;
    dragStart.current = null;
    if (Math.abs(dx) > 90) {
      void vote(top, dx > 0);
    } else {
      setDrag(null);
    }
  }

  async function restart() {
    setPendingRestart(true);
    const r = await restartPickSession(data.list_id, data.session_id);
    setPendingRestart(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setData(r);
    setCards(r.cards);
    setLikes(r.my_likes);
    setMatched(null);
  }

  // ---------- 匹配成功 ----------
  if (matched) {
    return (
      <div className="v2-pick-result">
        <div className="burst">🎉</div>
        <p className="eyebrow">你们都想吃</p>
        <h2 className="v2-disp">{matched.name || "就它了"}</h2>
        <div className="acts">
          <Link
            href={`/lists/${data.list_id}/places/${matched.place_id}`}
            className="v2-btn"
            style={{ padding: "13px 22px" }}
          >
            就它了 · 看详情
          </Link>
          <button
            type="button"
            className="v2-btn ghost"
            style={{ padding: "13px 22px" }}
            onClick={restart}
            disabled={pendingRestart}
          >
            {pendingRestart ? "开新一轮…" : "再来一轮"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- 滑完了 ----------
  if (!top) {
    // 注意用 likes（place_id 数组）而不是与 data.cards 求交：重进 session 时
    // cards 已排除投过票的店，交集会是空的（"随机就它"按钮变死按钮）
    return (
      <div className="v2-pick-result">
        {duo ? (
          <>
            <div className="burst">⏳</div>
            <h2 className="v2-disp">你滑完了</h2>
            <p className="sub">
              右滑了 {likes.length} 家 · 等对方滑完，一旦你们都想吃同一家会立刻揭晓
            </p>
            <div className="acts">
              <button
                type="button"
                className="v2-btn ghost"
                style={{ padding: "13px 22px" }}
                onClick={() => router.refresh()}
              >
                刷新看看
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="burst">🍜</div>
            <h2 className="v2-disp">
              {likes.length > 0 ? `选中 ${likes.length} 家` : "都没看上？"}
            </h2>
            {likes.length > 0 ? (
              <div className="acts" style={{ flexDirection: "column" }}>
                <button
                  type="button"
                  className="v2-btn"
                  style={{ padding: "13px 22px" }}
                  onClick={() => {
                    const id = likes[Math.floor(Math.random() * likes.length)];
                    if (id)
                      router.push(`/lists/${data.list_id}/places/${id}`);
                  }}
                >
                  从右滑里随机就它
                </button>
                <button
                  type="button"
                  className="v2-btn ghost"
                  style={{ padding: "13px 22px" }}
                  onClick={restart}
                  disabled={pendingRestart}
                >
                  再滑一轮
                </button>
              </div>
            ) : (
              <div className="acts">
                <button
                  type="button"
                  className="v2-btn ghost"
                  style={{ padding: "13px 22px" }}
                  onClick={restart}
                  disabled={pendingRestart}
                >
                  再来一轮
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ---------- 滑卡 ----------
  const dx = drag?.dx ?? 0;
  const style: React.CSSProperties = flyDir
    ? {
        transform: `translate(${flyDir === "right" ? 480 : -480}px, ${
          drag?.dy ?? 0
        }px) rotate(${flyDir === "right" ? 18 : -18}deg)`,
        opacity: 0,
        transition: "transform .22s ease-in, opacity .22s ease-in",
      }
    : drag
      ? {
          transform: `translate(${dx}px, ${drag.dy * 0.3}px) rotate(${dx / 18}deg)`,
        }
      : { transition: "transform .18s ease-out" };

  return (
    <div className="v2-pick">
      <p className="cnt">
        剩 {cards.length} 家{duo ? " · 两人都右滑就它" : ""}
      </p>
      <div className="stack">
        {/* 下一张垫底 */}
        {cards[1] && (
          <div className="v2-pick-card under" aria-hidden>
            <CardFace card={cards[1]} />
          </div>
        )}
        <div
          key={top.place_id}
          className="v2-pick-card"
          style={{ ...style, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragStart.current = null;
            setDrag(null);
          }}
        >
          <CardFace card={top} />
          {dx > 40 && <span className="stamp yes">想吃</span>}
          {dx < -40 && <span className="stamp no">跳过</span>}
        </div>
      </div>
      <div className="v2-pick-actions">
        <button
          type="button"
          aria-label="跳过"
          className="act no"
          onClick={() => vote(top, false)}
        >
          <svg className="v2-svg" width="26" height="26" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="想吃"
          className="act yes"
          onClick={() => vote(top, true)}
        >
          <svg className="v2-svg" width="26" height="26" viewBox="0 0 24 24">
            <path d="M19.5 5.1a5 5 0 0 0-7.1 0L12 5.5l-.4-.4a5 5 0 1 0-7.1 7.1l7.5 7.5 7.5-7.5a5 5 0 0 0 0-7.1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CardFace({ card }: { card: PickCard }) {
  return (
    <>
      <div
        className="img"
        style={
          card.photo
            ? { backgroundImage: `url('${card.photo}')` }
            : {
                background:
                  "linear-gradient(135deg,var(--v2-surface2),var(--v2-sunken))",
              }
        }
      />
      <div className="body">
        <div className="nm">{card.name}</div>
        <div className="mt">
          {[
            card.cuisine[0],
            card.price_range,
            card.google_rating != null ? `★${card.google_rating.toFixed(1)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </div>
        {card.reason && <div className="why">“{card.reason}”</div>}
      </div>
    </>
  );
}
