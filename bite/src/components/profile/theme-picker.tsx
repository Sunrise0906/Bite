"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTheme } from "@/lib/actions/ui-version";
import { THEMES, type BiteTheme } from "@/lib/theme";

/** V2 主题选择：四套完整设计语言（配色 + 字体 + 形态），即点即换 */
export function ThemePicker({ current }: { current: BiteTheme }) {
  const router = useRouter();
  const [t, setT] = useState<BiteTheme>(current);
  const [pending, start] = useTransition();

  function pick(next: BiteTheme) {
    if (next === t || pending) return;
    setT(next);
    start(async () => {
      await setTheme(next);
      router.refresh();
    });
  }

  return (
    <div className="v2-themes">
      {THEMES.map((o) => {
        const on = t === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => pick(o.id)}
            disabled={pending}
            className={`v2-theme-card${on ? " on" : ""}`}
            aria-pressed={on}
          >
            <span className="dots">
              {o.dots.map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
            <span className="nm" style={{ display: "block" }}>
              {o.label}
            </span>
            <span className="sub" style={{ display: "block" }}>
              {o.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}
