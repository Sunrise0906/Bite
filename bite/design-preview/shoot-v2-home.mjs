// 本地验证 V2 主页：登录 → 截 V1 主页 → /profile 切 V2 → 截 V2 主页（亮/暗）→ 切回 V1
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const BASE = "http://localhost:3000";

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type=email]').first().fill(env.E2E_TEST_EMAIL);
  await page.locator('input[type=password]').first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });
}

const browser = await chromium.launch();

// 亮色
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await login(page);

// V1 主页（基线）
await page.goto(`${BASE}/lists`); await page.waitForTimeout(2000);
await page.screenshot({ path: "design-preview/v2chk-home-v1.png", fullPage: true });
console.log("shot v1 home");

// 切 V2
await page.goto(`${BASE}/profile`); await page.waitForTimeout(1500);
await page.getByRole("button", { name: /V2 新版/ }).click();
await page.waitForTimeout(2000);
await page.goto(`${BASE}/lists`); await page.waitForTimeout(2500);
await page.screenshot({ path: "design-preview/v2chk-home-v2.png", fullPage: true });
console.log("shot v2 home");
await ctx.close();

// 暗色 V2
const ctxD = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
const pageD = await ctxD.newPage();
await login(pageD);
await pageD.goto(`${BASE}/profile`); await pageD.waitForTimeout(1500);
await pageD.getByRole("button", { name: /V2 新版/ }).click();
await pageD.waitForTimeout(2000);
await pageD.goto(`${BASE}/lists`); await pageD.waitForTimeout(2500);
await pageD.screenshot({ path: "design-preview/v2chk-home-v2-dark.png", fullPage: true });
console.log("shot v2 home dark");
// 切回 V1 收尾（不污染账号默认）
await pageD.goto(`${BASE}/profile`); await pageD.waitForTimeout(1200);
await pageD.getByRole("button", { name: /V1 经典/ }).click();
await pageD.waitForTimeout(1500);
await ctxD.close();

await browser.close();
console.log("done");
