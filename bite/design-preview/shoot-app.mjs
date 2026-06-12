// 登录态页面截图脚本（视觉验收用，跑完即弃）
// 用法：node design-preview/shoot-app.mjs
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
const email = env.E2E_TEST_EMAIL;
const password = env.E2E_TEST_PASSWORD;
if (!email || !password) throw new Error("E2E creds missing in .env.local");

const browser = await chromium.launch();

async function shoot(colorScheme, suffix) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme,
  });
  const page = await ctx.newPage();

  // 登录
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });
  await page.waitForTimeout(1500);

  const targets = [
    ["/lists", "app-lists"],
    ["/chat", "app-chat"],
    ["/quick-add", "app-quickadd"],
    ["/profile", "app-profile"],
    ["/recommendations", "app-recs"],
  ];
  for (const [path, name] of targets) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: new URL(`./${name}${suffix}.png`, import.meta.url).pathname.slice(1),
      fullPage: true,
    });
    console.log(`shot: ${name}${suffix}`);
  }

  // list 详情：取第一张 list 卡的 href 直接导航（避免 hover 动效干扰点击）
  await page.goto(`${BASE}/lists`);
  await page.waitForTimeout(1500);
  const firstCard = page.locator('a[href^="/lists/"]').first();
  if (await firstCard.count()) {
    const href = await firstCard.getAttribute("href");
    await page.goto(`${BASE}${href}`);
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: new URL(`./app-listdetail${suffix}.png`, import.meta.url).pathname.slice(1),
      fullPage: true,
    });
    console.log(`shot: app-listdetail${suffix}`);
  } else {
    console.log("no list card found, skipped detail");
  }

  await ctx.close();
}

await shoot("light", "");
await shoot("dark", "-dark");
await browser.close();
console.log("done");
