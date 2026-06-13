// 本地验证 chat rate limit：登录后连发 11 个空 body 请求。
// 限流检查在 body 解析之前，所以前 10 个 → 400（空消息，但计数），第 11 个 → 429。
// 零 LLM 成本。
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
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

await page.goto(`${BASE}/login`);
await page.locator('input[type=email]').first().fill(env.E2E_TEST_EMAIL);
await page.locator('input[type=password]').first().fill(env.E2E_TEST_PASSWORD);
await page.getByRole("button", { name: /^登录$/ }).first().click();
await page.waitForURL(/\/lists/, { timeout: 20000 });

const statuses = await page.evaluate(async () => {
  const out = [];
  for (let i = 0; i < 11; i++) {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    out.push(r.status);
  }
  return out;
});

console.log("statuses:", statuses.join(","));
const first10 = statuses.slice(0, 10);
const eleventh = statuses[10];
const ok = first10.every((s) => s === 400) && eleventh === 429;
console.log(ok ? "RATE LIMIT OK (10×400 then 429)" : "RATE LIMIT FAIL");

await browser.close();
process.exit(ok ? 0 : 1);
