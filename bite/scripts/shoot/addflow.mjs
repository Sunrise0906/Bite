// V2 add-flow 视觉验证：登录 → 贴文本（单店 / 合集）→ LLM 抽取 → 确认页截图。
// 用法：node design-preview/shoot-addflow.mjs（需 dev server 跑在 :3000）
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
const SINGLE_TEXT =
  "朋友推荐了一家叫「川湘居」的川菜馆，在 Irvine 的 Culver Plaza，人均 25 刀左右。招牌菜是水煮鱼和辣子鸡，说环境适合朋友聚餐，周末排队有点长。";
const MULTI_TEXT = `Irvine 宝藏中餐合集｜这 3 家闭眼冲🔥
图1️⃣-2️⃣ 老陕面馆：Diamond Jamboree 里的西北面食，油泼面必点，人均 $15
图3️⃣ 蜀香园：Culver 附近的川菜，麻婆豆腐一绝，环境一般但便宜，人均 $20
图4️⃣-5️⃣ 粤来顺：Northwood 的粤式茶餐厅，烧鸭炒饭和丝袜奶茶都好，适合带长辈，人均 $22`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();

async function login() {
  await page.goto(`${BASE}/login`);
  await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
  await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });
}

async function submitText(text, expectUrl) {
  await page.goto(`${BASE}/lists`);
  const ta = page.locator("textarea").first();
  await ta.waitFor({ timeout: 10000 });
  await ta.fill(text);
  await page.waitForTimeout(400);
  // free_text 模式出现的提交按钮（AI 解析）
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL(expectUrl, { timeout: 60000 });
  await page.waitForTimeout(1200);
}

async function cancel() {
  const btn = page.getByRole("button", { name: /^取消$/ }).first();
  await btn.click();
  await page.waitForURL(/\/lists/, { timeout: 15000 }).catch(() => {});
}

try {
  await login();

  // 1. V2 主页（含新建清单行）
  await page.goto(`${BASE}/lists`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "design-preview/addflow-home.png", fullPage: true });
  console.log("✓ addflow-home.png");

  // 2. 单店确认页
  await submitText(SINGLE_TEXT, /\/quick-add(\?|$)/);
  await page.screenshot({ path: "design-preview/addflow-single.png", fullPage: true });
  console.log("✓ addflow-single.png");
  await cancel();

  // 3. 合集确认页
  await submitText(MULTI_TEXT, /\/quick-add\/multi/);
  await page.screenshot({ path: "design-preview/addflow-multi.png", fullPage: true });
  console.log("✓ addflow-multi.png");
  await cancel();

  console.log("DONE");
} catch (e) {
  await page.screenshot({ path: "design-preview/addflow-error.png", fullPage: true });
  console.error("FAIL:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
