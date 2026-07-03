"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrichPlaceFromXhsPost } from "@/lib/actions/xhs-enrich";

/** 小红书帖子卡上的「导入」按钮：抓帖 → AI 抽取 → 合并进本店 */
export function XhsImportButton({
  placeId,
  postUrl,
}: {
  placeId: string;
  postUrl: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <span className="v2-pill v2-pill-visited" style={{ flex: "none" }}>
        {done}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        disabled={pending}
        className="v2-btn ghost"
        style={{ padding: "6px 12px", fontSize: 12, flex: "none" }}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await enrichPlaceFromXhsPost(placeId, postUrl);
            if ("error" in r) {
              setError(r.error);
              return;
            }
            const parts: string[] = [];
            if (r.added_dishes > 0) parts.push(`+${r.added_dishes} 菜`);
            if (r.added_photos > 0) parts.push(`+${r.added_photos} 图`);
            if (r.note_appended) parts.push("备注已补充");
            setDone(parts.length > 0 ? `已合并 ${parts.join(" · ")}` : "已合并");
            router.refresh();
          })
        }
      >
        {pending ? "抓取中…" : "导入"}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "var(--v2-danger)", maxWidth: 180 }}>
          {error}
        </span>
      )}
    </span>
  );
}
