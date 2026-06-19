"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrichPlacesFromGoogle } from "@/lib/actions/enrich";

/** 在 Google 上找到这些店：拿评分 + 评价数 + 精确坐标，标到地图 */
export function EnrichButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await enrichPlacesFromGoogle();
      if ("error" in r) {
        setMsg(r.error);
        return;
      }
      if (r.enriched > 0) {
        setMsg(`已从 Google 拿到 ${r.enriched} 家店的评分 + 坐标`);
        router.refresh();
      } else {
        setMsg(
          r.tried > 0
            ? "这些店没在 Google 上找到（名字/地址太模糊，或 Places API 没开）"
            : "没有需要丰富的店",
        );
      }
    });
  }

  return (
    <div style={{ textAlign: "center" }}>
      <button
        type="button"
        className="v2-btn"
        onClick={run}
        disabled={pending}
        style={{ padding: "11px 18px" }}
      >
        {pending ? "在 Google 上查…" : `在 Google 上丰富 ${count} 家店（评分 + 坐标）`}
      </button>
      {msg && (
        <p className="v2-muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          {msg}
        </p>
      )}
    </div>
  );
}
