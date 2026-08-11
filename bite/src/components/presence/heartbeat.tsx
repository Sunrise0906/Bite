"use client";

import { useEffect } from "react";
import { heartbeat } from "@/lib/actions/presence";

/** 挂在 app 布局里，30 秒打一次卡。页面隐藏时不打（省得后台标签页一直写库）。 */
export function Heartbeat() {
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    beat();
    const t = setInterval(beat, 30_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return null;
}
