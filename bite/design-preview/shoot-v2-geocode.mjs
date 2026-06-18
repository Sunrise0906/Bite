// 测地理编码：V2 地图 → 点「补坐标」→ 看结果 + 地图是否出 pin
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
await page.goto(`${BASE}/login`);
await page.locator('input[type=email]').first().fill(env.E2E_TEST_EMAIL);
await page.locator('input[type=password]').first().fill(env.E2E_TEST_PASSWORD);
await page.getByRole("button", { name: /^登录$/ }).first().click();
await page.waitForURL(/\/lists/, { timeout: 20000 });
await page.goto(`${BASE}/profile`); await page.waitForTimeout(1200);
await page.getByRole("button", { name: /V2 新版/ }).click();
await page.waitForTimeout(1500);

await page.goto(`${BASE}/map`); await page.waitForTimeout(2500);
await page.screenshot({ path: "design-preview/v2chk-map-before.png", fullPage: true });
const btn = page.getByRole("button", { name: /标到地图/ });
if (await btn.count()) {
  console.log("clicking backfill...");
  await btn.click();
  // 等 geocoding（最多 40 家，每家一个 API 调用，可能 10-30s）
  await page.waitForTimeout(35000);
  await page.screenshot({ path: "design-preview/v2chk-map-after.png", fullPage: true });
  console.log("shot after backfill");
} else {
  console.log("no backfill button (maybe map already has pins)");
}

await page.goto(`${BASE}/profile`); await page.waitForTimeout(1000);
await page.getByRole("button", { name: /V1 经典/ }).click();
await page.waitForTimeout(1200);
await browser.close();
console.log("done");
