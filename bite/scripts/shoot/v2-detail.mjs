// 验证 V2 详情：找一家「去过」的店（看回忆卡）+ 一家想去的店，切 V2 直接打开截图
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

// 找账号
const prof = await get(`profiles?email=eq.${encodeURIComponent(env.E2E_TEST_EMAIL)}&select=id`);
const uid = prof[0].id;
const lists = await get(`lists?owner_id=eq.${uid}&select=id`);
const listIds = lists.map((l) => l.id).join(",");
// 一家去过、一家想去
const visited = await get(`places?list_id=in.(${listIds})&status=eq.visited&select=id,list_id,name&limit=1`);
const want = await get(`places?list_id=in.(${listIds})&status=eq.want_to_go&select=id,list_id,name&limit=1`);
console.log("visited:", visited[0]?.name, "| want:", want[0]?.name);

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

async function shot(p, name) {
  if (!p) { console.log("skip", name); return; }
  await page.goto(`${BASE}/lists/${p.list_id}/places/${p.id}`);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `design-preview/${name}.png`, fullPage: true });
  console.log("shot", name);
}
await shot(visited[0], "v2chk-detail-visited");
await shot(want[0], "v2chk-detail-want");

// 切回 V1
await page.goto(`${BASE}/profile`); await page.waitForTimeout(1000);
await page.getByRole("button", { name: /V1 经典/ }).click();
await page.waitForTimeout(1200);
await browser.close();
console.log("done");
