// 探针：验证 globals.css :root 上那些「派生 token」（--status-*-bg / --success-*）
// 在 .ui-v2 作用域里到底解析成什么。
//
// 疑问：审计说这些 token 在 :root 上就已经把 var(--gold-soft) 代换掉了，所以
// .ui-v2 重新声明 --gold-soft 够不到它们。但 CSS 自定义属性是**用的时候**才代换的，
// 所以理论上应该能跟随。这个脚本用真实浏览器测出答案，不靠推理。
//
// 用法：node scripts/verify/token-bridge.mjs（dev server 需在 :3000）

import { chromium } from "@playwright/test";

const BASE = process.env.VERIFY_BASE || "http://localhost:3000";
const THEMES = ["terracotta", "midnight", "pop", "gallery"];
const browser = await chromium.launch();

// 用登录页（未登录可达）：它在 (auth)/layout 下同样带 .ui-v2 theme-*
for (const scheme of ["light", "dark"]) {
  for (const t of THEMES) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    await ctx.addCookies([{ name: "bite_theme", value: t, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);

    const probe = await page.evaluate(() => {
      // 造一个位于 .ui-v2 里的探针元素，量它实际拿到的颜色
      const host = document.querySelector(".ui-v2");
      if (!host) return { error: "页面上没有 .ui-v2 元素" };
      const el = document.createElement("div");
      el.style.setProperty("--probe-want", "var(--status-want-bg)");
      el.style.setProperty("--probe-gold", "var(--gold-soft)");
      el.style.background = "var(--status-want-bg)";
      el.style.color = "var(--status-want-text)";
      el.style.borderColor = "var(--success-bg)";
      host.appendChild(el);
      const cs = getComputedStyle(el);
      const out = {
        status_want_bg: cs.backgroundColor,
        status_want_text: cs.color,
        success_bg: cs.borderColor,
        gold_soft_raw: cs.getPropertyValue("--gold-soft").trim(),
      };
      el.remove();
      return out;
    });

    console.log(
      `${scheme.padEnd(5)} ${t.padEnd(10)}  chip-want底=${String(probe.status_want_bg).padEnd(22)} 字=${String(probe.status_want_text).padEnd(22)} --gold-soft=${probe.gold_soft_raw}`,
    );
    await ctx.close();
  }
}

await browser.close();
