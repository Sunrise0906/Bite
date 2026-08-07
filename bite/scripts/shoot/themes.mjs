// 主题系统视觉验证：4 主题 × 手机(390)/桌面(1366) × 主页/清单详情/登录。
// 用法：node design-preview/shoot-themes.mjs（dev server 需在 :3000）
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const BASE = "http://localhost:3000";
const THEMES = ["terracotta", "midnight", "pop", "gallery"];
const browser = await chromium.launch();

async function loginCtx(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
  await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });
  return { ctx, page };
}

const setTheme = (ctx, t) =>
  ctx.addCookies([{ name: "bite_theme", value: t, url: BASE }]);

// 手机端：主页
{
  const { ctx, page } = await loginCtx({ width: 390, height: 844 });
  for (const t of THEMES) {
    await setTheme(ctx, t);
    await page.goto(`${BASE}/lists`);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `design-preview/theme-${t}-m-home.png` });
    console.log(`✓ ${t} m-home`);
  }
  await ctx.close();
}

// 手机端：登录页（未登录）
{
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ap = await anon.newPage();
  for (const t of THEMES) {
    await anon.addCookies([{ name: "bite_theme", value: t, url: BASE }]);
    await ap.goto(`${BASE}/login`);
    await ap.waitForTimeout(700);
    await ap.screenshot({ path: `design-preview/theme-${t}-m-login.png` });
    console.log(`✓ ${t} m-login`);
  }
  await anon.close();
}

// 桌面端：主页 + 清单详情
{
  const { ctx, page } = await loginCtx({ width: 1366, height: 900 });
  // 用清单行链接（/lists/<id>），别抓到 deck 卡的店铺详情链接
  const href = await page.locator("a.v2-lrow").first().getAttribute("href");
  for (const t of THEMES) {
    await setTheme(ctx, t);
    await page.goto(`${BASE}/lists`);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `design-preview/theme-${t}-d-home.png` });
    if (href) {
      await page.goto(`${BASE}${href}`);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `design-preview/theme-${t}-d-list.png` });
    }
    console.log(`✓ ${t} desktop`);
  }
  await ctx.close();
}

await browser.close();
console.log("DONE");
