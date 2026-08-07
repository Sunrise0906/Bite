// V2 list 详情 + 地图截图
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const BASE = "http://localhost:3000";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const get = async (p) => (await fetch(`${SUPA}/rest/v1/${p}`, { headers: hdr })).json();

const prof = await get(`profiles?email=eq.${encodeURIComponent(env.E2E_TEST_EMAIL)}&select=id`);
const lists = await get(`lists?owner_id=eq.${prof[0].id}&select=id,name&order=created_at.desc`);
// 选一个有店的 list（取 places 最多的）
let target = lists[0];
for (const l of lists) {
  const cnt = await get(`places?list_id=eq.${l.id}&select=id`);
  if (cnt.length >= 3) { target = l; break; }
}
console.log("list:", target.name);

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

await page.goto(`${BASE}/lists/${target.id}`); await page.waitForTimeout(2500);
await page.screenshot({ path: "design-preview/v2chk-listdetail.png", fullPage: true });
console.log("shot list detail");

await page.goto(`${BASE}/map`); await page.waitForTimeout(4000);
await page.screenshot({ path: "design-preview/v2chk-map.png", fullPage: true });
console.log("shot map");

await page.goto(`${BASE}/profile`); await page.waitForTimeout(1000);
await page.getByRole("button", { name: /V1 经典/ }).click();
await page.waitForTimeout(1200);
await browser.close();
console.log("done");
