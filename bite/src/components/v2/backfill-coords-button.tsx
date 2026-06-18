"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { backfillPlaceCoords } from "@/lib/actions/geocode";

/** 把有地址没坐标的店补上经纬度，标到地图 */
export function BackfillCoordsButton({ missing }: { missing: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await backfillPlaceCoords();
      if ("error" in r) {
        setMsg(r.error);
        return;
      }
      if (r.updated > 0) {
        setMsg(`已把 ${r.updated} 家店标到地图`);
        router.refresh();
      } else {
        setMsg(
          r.tried > 0
            ? "这些地址没能定位（太模糊或 Geocoding API 没开）"
            : "没有需要补坐标的店",
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
        {pending ? "定位中…" : `把 ${missing} 家有地址的店标到地图`}
      </button>
      {msg && (
        <p className="v2-muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          {msg}
        </p>
      )}
    </div>
  );
}
