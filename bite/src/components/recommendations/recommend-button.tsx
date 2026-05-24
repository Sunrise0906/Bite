"use client";

import { useState, useTransition } from "react";
import { sendRecommendation } from "@/lib/actions/recommendations";

type State =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "ok"; recipient: string }
  | { phase: "error"; message: string };

export function RecommendButton({
  placeId,
  placeName,
  variant = "btn",
}: {
  placeId: string;
  placeName: string;
  variant?: "btn" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const [pending, startTransition] = useTransition();

  function send() {
    setState({ phase: "sending" });
    startTransition(async () => {
      const r = await sendRecommendation({
        to_email: email,
        place_id: placeId,
        message: message || undefined,
      });
      if ("error" in r) {
        setState({ phase: "error", message: r.error });
      } else {
        setState({ phase: "ok", recipient: r.recipient_email });
        setTimeout(() => {
          setOpen(false);
          setState({ phase: "idle" });
          setEmail("");
          setMessage("");
        }, 1500);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          variant === "chip"
            ? "chip chip-neutral cursor-pointer hover:opacity-80"
            : "btn-secondary px-3 py-1.5 text-sm"
        }
        title="推荐给朋友"
      >
        📤 推荐
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <h3 className="heading-display text-lg">推荐给朋友</h3>
            <p className="mt-1 text-sm text-zinc-600">
              把「{placeName}」推荐给一个 Bite 用户
            </p>

            {state.phase === "ok" ? (
              <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                ✓ 已发送给 {state.recipient}
              </p>
            ) : (
              <>
                <div className="mt-4">
                  <label
                    htmlFor="to_email"
                    className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
                  >
                    朋友的邮箱
                  </label>
                  <input
                    id="to_email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@example.com"
                    className="field-input mt-1.5 text-sm"
                    autoComplete="off"
                  />
                </div>

                <div className="mt-3">
                  <label
                    htmlFor="rec_message"
                    className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
                  >
                    一句话理由（可选）
                  </label>
                  <textarea
                    id="rec_message"
                    rows={2}
                    maxLength={200}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="你肯定喜欢这家的牛肉面"
                    className="field-input mt-1.5 text-sm"
                  />
                </div>

                {state.phase === "error" && (
                  <p
                    role="alert"
                    className="mt-2 text-sm text-red-700"
                  >
                    {state.message}
                  </p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={send}
                    disabled={pending || !email.trim()}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    {pending ? "发送中..." : "发送"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
