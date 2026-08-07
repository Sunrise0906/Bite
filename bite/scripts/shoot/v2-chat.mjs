// 验证 V2 聊天可操作推荐卡：切 V2 → 发让 AI 从库里挑店的消息 → 等流式 → 截图
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
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

// 切 V2
await page.goto(`${BASE}/profile`); await page.waitForTimeout(1200);
await page.getByRole("button", { name: /V2 新版/ }).click();
await page.waitForTimeout(1500);

// 进聊天发消息
await page.goto(`${BASE}/chat`); await page.waitForTimeout(2000);
const ta = page.locator("textarea").first();
await ta.fill("从我的清单里推荐两家想去的店，用书名号标出店名");
await ta.press("Enter");

// 等流式结束（出现「重新生成」或等够时间）
try {
  await page.getByRole("button", { name: /重新生成/ }).waitFor({ timeout: 45000 });
} catch {
  await page.waitForTimeout(8000);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: "design-preview/v2chk-chat.png", fullPage: true });
console.log("shot v2 chat");

// 切回 V1 收尾
await page.goto(`${BASE}/profile`); await page.waitForTimeout(1000);
await page.getByRole("button", { name: /V1 经典/ }).click();
await page.waitForTimeout(1200);

await browser.close();
console.log("done");
