import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
await page.getByRole("button", { name: /^登录$/ }).first().click();
await page.waitForURL(/\/lists/, { timeout: 20000 });
// 1. 统计页
await page.goto(`${BASE}/stats`);
await page.waitForTimeout(1400);
await page.screenshot({ path: "design-preview/feat-stats.png", fullPage: true });
console.log("✓ stats");
// 2. 一起选（sql/0014 未跑 → 应显示友好错误而不是崩溃）
await page.goto(`${BASE}/lists`);
await page.waitForTimeout(800);
const listHref = await page.locator("a.v2-lrow").first().getAttribute("href");
await page.goto(`${BASE}${listHref}/pick`);
await page.waitForTimeout(1200);
await page.screenshot({ path: "design-preview/feat-pick.png" });
console.log("✓ pick (期望友好错误态)");
// 3. 清单详情（一起选入口按钮）
await page.goto(`${BASE}${listHref}`);
await page.waitForTimeout(1000);
await page.screenshot({ path: "design-preview/feat-listentry.png" });
console.log("✓ list entry");
// 4. 主页（quick-add 新按钮 + 建单类别 chips）
await page.goto(`${BASE}/lists`);
await page.waitForTimeout(900);
await page.screenshot({ path: "design-preview/feat-home.png", fullPage: true });
console.log("✓ home");
await browser.close();
