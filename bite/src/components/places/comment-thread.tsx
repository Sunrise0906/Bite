"use client";

import { useState, useTransition } from "react";
import {
  addComment,
  deleteComment,
  type CommentView,
} from "@/lib/actions/comments";
import { relDate } from "@/lib/util/rel-date";

// 店铺评论区 —— 全 app 唯一能让两个人真正对话的地方。
//
// 第一条永远是「@某某 加的」：既回答了共享清单里最基本的问题（这家是谁加的，
// created_by 一直存着却从没显示过），也让空评论区不至于是一片空白。

export function CommentThread({
  placeId,
  initial,
  addedBy,
  addedAt,
}: {
  placeId: string;
  initial: CommentView[];
  /** 谁加的这家店（created_by 的显示名） */
  addedBy: string | null;
  addedAt: string | null;
}) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    start(async () => {
      const r = await addComment(placeId, body);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setItems((prev) => [...prev, r.comment]);
      setText("");
    });
  }

  function remove(id: string) {
    if (!window.confirm("删掉这条留言？")) return;
    start(async () => {
      const r = await deleteComment(id);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setItems((prev) => prev.filter((c) => c.id !== id));
    });
  }

  return (
    <section className="v2-comments">
      <div className="v2-sec">
        <h3>留言 {items.length > 0 ? `· ${items.length}` : ""}</h3>
      </div>

      {addedBy && (
        <div className="v2-cmt sys">
          <span className="who">
            {addedBy === "你" ? "你" : `@${addedBy}`}
          </span>{" "}
          加了这家店
          {addedAt && <span className="when"> · {relDate(addedAt)}</span>}
        </div>
      )}

      {items.map((c) => (
        <div key={c.id} className="v2-cmt">
          <div className="head">
            <span className="who">@{c.author}</span>
            <span className="when">{relDate(c.created_at)}</span>
            {c.editable && (
              <button
                type="button"
                className="del"
                onClick={() => remove(c.id)}
                disabled={pending}
              >
                删除
              </button>
            )}
          </div>
          <p className="body">{c.body}</p>
        </div>
      ))}

      <div className="v2-cmt-compose">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl + Enter 发送；单独 Enter 留给换行（留言常常要分段）
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder="跟朋友说点什么…（⌘/Ctrl + Enter 发送）"
          className="field-input"
        />
        <button
          type="button"
          className="v2-btn"
          onClick={send}
          disabled={pending || text.trim().length === 0}
        >
          {pending ? "…" : "发送"}
        </button>
      </div>

      {error && (
        <p role="alert" className="v2-cmt-err">
          {error}
        </p>
      )}
    </section>
  );
}
