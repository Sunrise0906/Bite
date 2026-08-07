// 一次性清理：删掉历史 e2e 失败残留的 [E2E] 前缀 list（生产站点 UI 流程删除）
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

const BASE = "https://bite-sand.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(`${BASE}/login`);
await page.locator('input[type="email"]').first().fill(env.E2E_TEST_EMAIL);
await page.locator('input[type="password"]').first().fill(env.E2E_TEST_PASSWORD);
await page.getByRole("button", { name: /^登录$/ }).first().click();
await page.waitForURL(/\/lists/, { timeout: 20000 });

for (let round = 0; round < 10; round++) {
  await page.goto(`${BASE}/lists`);
  await page.waitForTimeout(1500);
  // 找第一个 [E2E] 前缀的 list 链接
  const link = page.locator('a[href^="/lists/"]', { hasText: "[E2E]" }).first();
  if ((await link.count()) === 0) {
    console.log("没有 [E2E] list 了，清理完成");
    break;
  }
  const name = (await link.textContent())?.slice(0, 40);
  const href = await link.getAttribute("href");
  await page.goto(`${BASE}${href}`);
  page.once("dialog", (d) => d.accept().catch(() => {}));
  await page.getByRole("button", { name: /^删除 list$/ }).first().click({ timeout: 10000 });
  await page.waitForURL(/\/lists\/?(\?.*)?$/, { timeout: 15000 });
  console.log(`已删除: ${name}`);
}

await browser.close();
