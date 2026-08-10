// 清单页删店的端到端验证。
//
// 背景：删店以前只在编辑页最底下的「危险操作」区，路径是
//   清单 → 点卡片 → 详情页拉到底找「编辑」 → 编辑页拉到底 → 删除（四层）。
// 卡片上没有任何入口 —— V1 的三点菜单 PlaceCardMenu 随 V1 一起删了，
// 而 V2 从来没有等价物。现在清单页有「管理」开关，开了之后每张卡片右侧
// 那一栏从「菜单」换成 编辑 / 删除。
//
// 这个脚本自己建一家一次性的店来删，不碰真实数据。
// 用法：node scripts/verify/place-delete.mjs（dev server 需在 :3000）

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const BASE = process.env.VERIFY_BASE || "http://localhost:3000";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };

const auth = await (
  await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_TEST_EMAIL, password: env.E2E_TEST_PASSWORD }),
  })
).json();
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" };

const mine = await (
  await fetch(`${SUPA}/rest/v1/lists?owner_id=eq.${auth.user.id}&select=id,name&limit=1`, { headers: H })
).json();
if (!mine?.[0]) { console.log("测试账号没有自己的清单，跳过"); process.exit(0); }
const listId = mine[0].id;

const NAME = "[验证] 待删除的店";
const created = await (
  await fetch(`${SUPA}/rest/v1/places`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      list_id: listId, name: NAME, address: "Irvine, CA",
      cuisine: ["验证用"], status: "want_to_go", created_by: auth.user.id, source: "manual",
    }),
  })
).json();
const placeId = created?.[0]?.id;
if (!placeId) { console.log("建测试店失败：", JSON.stringify(created).slice(0, 200)); process.exit(1); }
console.log(`在「${mine[0].name}」里建了一次性测试店 ${placeId.slice(0, 8)}…`);

const stillExists = async () =>
  ((await (await fetch(`${SUPA}/rest/v1/places?id=eq.${placeId}&select=id`, { headers: H })).json()) || []).length > 0;

const browser = await chromium.launch();
let confirmed = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 950 } })).newPage();
  page.on("dialog", (d) => { confirmed++; d.accept(); });

  await page.goto(`${BASE}/login`);
  await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
  await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });

  await page.goto(`${BASE}/lists/${listId}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);

  console.log("\n[1] 默认状态下卡片右侧是「菜单」，没有删除");
  {
    const card = page.locator(".v2-pcard").filter({ hasText: NAME }).first();
    if (!(await card.count())) { bad("页面上找不到测试店"); throw new Error("stop"); }
    if (await card.locator(".pcard-menu").count()) ok("显示「菜单」");
    else bad("没有菜单栏");
    if ((await card.getByRole("button", { name: "删除" }).count()) === 0) ok("默认不显示删除（不会误触）");
    else bad("默认就有删除按钮");
  }

  console.log("\n[2] 开「管理」后出现 编辑 / 删除");
  {
    await page.getByRole("button", { name: "管理" }).first().click();
    await page.waitForTimeout(500);
    const card = page.locator(".v2-pcard").filter({ hasText: NAME }).first();
    if (await card.getByRole("link", { name: "编辑" }).count()) ok("出现「编辑」");
    else bad("没有编辑入口");
    if (await card.getByRole("button", { name: "删除" }).count()) ok("出现「删除」");
    else bad("没有删除入口");
  }

  console.log("\n[3] 删除要确认，且真的删掉");
  {
    const card = page.locator(".v2-pcard").filter({ hasText: NAME }).first();
    await card.getByRole("button", { name: "删除" }).click();
    await page.waitForTimeout(3000);
    if (confirmed > 0) ok("弹了确认框");
    else bad("没有确认框 —— 危险");
    if (!(await stillExists())) ok("库里已删除");
    else bad("库里还在 —— 删除没生效");
    const gone = (await page.locator(".v2-pcard").filter({ hasText: NAME }).count()) === 0;
    if (gone) ok("列表里也不见了");
    else bad("列表还显示着这家店");
  }
} catch (e) {
  if (String(e.message) !== "stop") console.log("异常：", e.message);
} finally {
  await browser.close();
  // 兜底清理（删除失败时把测试数据收掉）
  await fetch(`${SUPA}/rest/v1/places?id=eq.${placeId}`, { method: "DELETE", headers: H });
}

console.log(`\n${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
