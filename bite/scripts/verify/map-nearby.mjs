// 「附近去哪」（原 /map）的端到端验证。
//
// 背景：旧地图只是把所有店画成彩色圆点，点开的气泡还链到**编辑页** ——
// 它不回答任何问题。重做成「定位 → 按距离升序 → 可点的列表」之后，
// 需要证明的是**排序真的按距离**，而不是「页面上出现了 mi 字样」。
//
// 做法：把浏览器定位伪造到某一家店的坐标上，那家店就必须排第一并显示
// 「就在附近」；同时脚本自己独立算一遍 haversine（故意不 import
// lib/places/distance.ts，否则公式错了两边一起错），比对整个顺序。
//
// 用法：node scripts/verify/map-nearby.mjs（dev server 需在 :3000）

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

// 独立实现，不复用 app 里的那份
const R = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(rad(a.lat)) * Math.cos(rad(b.lat));
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const auth = await (
  await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_TEST_EMAIL, password: env.E2E_TEST_PASSWORD }),
  })
).json();
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}` };

// 用户能看到的、有坐标的店（RLS 已经帮我们过滤好了）
const dbPlaces = await (
  await fetch(
    `${SUPA}/rest/v1/places?select=id,list_id,name,lat,lng,status&lat=not.is.null&lng=not.is.null`,
    { headers: H },
  )
).json();
if (!Array.isArray(dbPlaces) || dbPlaces.length < 2) {
  console.log(`\n跳过：测试账号只有 ${dbPlaces?.length ?? 0} 家带坐标的店，验不了排序`);
  process.exit(0);
}
// 站到其中一家店的头上
const anchor = dbPlaces[0];
const origin = { lat: anchor.lat, lng: anchor.lng };
const expected = dbPlaces
  .map((p) => ({ ...p, d: haversine(origin, { lat: p.lat, lng: p.lng }) }))
  .sort((a, b) => a.d - b.d);

const browser = await chromium.launch();

async function login(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
  await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });
  return page;
}

// ---------- 有定位 ----------
const ctx = await browser.newContext({
  viewport: { width: 1000, height: 1200 },
  permissions: ["geolocation"],
  geolocation: { latitude: origin.lat, longitude: origin.lng },
});
// 数 fitBounds 被调了几次：这是「点一下 marker 会不会把视野拽回去」的直接指标。
// 在 Maps JS 加载出来的那一刻把 fitBounds 包一层（轮询够快，赶在建图之前）。
await ctx.addInitScript(() => {
  window.__fit = 0;
  const t = setInterval(() => {
    const M = window.google?.maps?.Map;
    if (!M) return;
    clearInterval(t);
    const orig = M.prototype.fitBounds;
    M.prototype.fitBounds = function (...a) { window.__fit++; return orig.apply(this, a); };
  }, 5);
});
const page = await login(ctx);
await page.goto(`${BASE}/map`);
await page.waitForSelector(".v2-nearby-list", { timeout: 20000 });
await page.getByRole("button", { name: "全部" }).click();
await page.waitForTimeout(600);

console.log("\n[1] 页面在回答「现在去哪」");
{
  const h1 = (await page.locator("h1").first().innerText()).trim();
  if (h1 === "附近去哪") ok(`标题：${h1}`);
  else bad(`标题还是「${h1}」`);
  const geoTxt = (await page.locator(".v2-nearby-geo").innerText()).trim();
  if (/离你/.test(geoTxt) && !/不是离你/.test(geoTxt)) ok(`定位状态：${geoTxt}`);
  else bad(`拿到定位了却显示「${geoTxt}」`);
}

console.log("\n[2] 顺序真的按距离（对比脚本独立算出的结果）");
{
  const names = await page.locator(".v2-nearby-row .nm").allInnerTexts();
  const want = expected.map((p) => p.name);
  if (names.length !== want.length) {
    bad(`列表 ${names.length} 家，库里 ${want.length} 家`);
  } else if (JSON.stringify(names) === JSON.stringify(want)) {
    ok(`${names.length} 家，顺序与独立 haversine 完全一致`);
  } else {
    bad(`顺序不一致\n     页面: ${names.slice(0, 4).join(" / ")}\n     期望: ${want.slice(0, 4).join(" / ")}`);
  }

  const first = (await page.locator(".v2-nearby-row").first().innerText()).replace(/\n/g, " ");
  if (first.includes(anchor.name)) ok(`站在「${anchor.name}」头上，它就排第一`);
  else bad(`站在「${anchor.name}」头上，第一名却是：${first}`);
  if (/就在附近/.test(first)) ok("零距离显示「就在附近」，不是「0.0 mi」");
  else bad(`零距离显示成：${first}`);
}

console.log("\n[3] 距离是给人看的");
{
  const dists = await page.locator(".v2-nearby-row .dist").allInnerTexts();
  const bogus = dists.filter((d) => /NaN|Infinity|undefined/.test(d));
  if (bogus.length === 0) ok(`${dists.length} 条距离文案都干净`);
  else bad(`脏值：${bogus.join(",")}`);
  if (dists.length === expected.length) ok("每一行都有距离");
  else bad(`只有 ${dists.length}/${expected.length} 行有距离`);
}

console.log("\n[4] 点进去是详情页，不是编辑页");
{
  const hrefs = await page.locator(".v2-nearby-row .body").evaluateAll((els) =>
    els.map((e) => e.getAttribute("href")),
  );
  const edits = hrefs.filter((h) => /\/edit$/.test(h ?? ""));
  if (edits.length === 0) ok("没有任何一行链到 /edit");
  else bad(`${edits.length} 行仍链到编辑页`);
  const shaped = hrefs.every((h) => /^\/lists\/[^/]+\/places\/[^/]+$/.test(h ?? ""));
  if (shaped) ok("链接形如 /lists/<list>/places/<place>");
  else bad(`链接格式不对：${hrefs[0]}`);
}

console.log("\n[5] 筛选真的在筛");
{
  const all = await page.locator(".v2-nearby-row").count();
  await page.getByRole("button", { name: "想去" }).click();
  await page.waitForTimeout(400);
  const want = await page.locator(".v2-nearby-row").count();
  const dbWant = dbPlaces.filter((p) => p.status === "want_to_go").length;
  if (want === dbWant) ok(`「想去」筛出 ${want} 家，与库里一致（全部 ${all} 家）`);
  else bad(`「想去」筛出 ${want} 家，库里是 ${dbWant} 家`);
}

console.log("\n[6] 点列表项挪地图，且不会被 fitBounds 拽回来");
{
  await page.getByRole("button", { name: "全部" }).click();
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => window.__fit);
  if (before > 0) ok(`初次进入框好了视野（fitBounds ×${before}）`);
  else bad("从没 fitBounds 过");

  const rows = page.locator(".v2-nearby-row");
  const target = rows.nth(Math.min(2, (await rows.count()) - 1));
  await target.locator(".pin").click();
  await page.waitForTimeout(800);

  const on = await page.locator(".v2-nearby-row.on").count();
  if (on === 1) ok("选中态只有一行");
  else bad(`选中态有 ${on} 行`);
  const after = await page.evaluate(() => window.__fit);
  if (after === before) ok("点选后没有再 fitBounds，pan 过去的视野保住了");
  else bad(`点选又触发了 ${after - before} 次 fitBounds —— 视野会被拽回全局`);
}

await ctx.close();

// ---------- 拒绝定位 ----------
console.log("\n[7] 拒绝定位时说实话");
{
  const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 1200 } });
  // 不授予 geolocation 权限 → getCurrentPosition 直接报错，走兜底分支
  const p2 = await login(ctx2);
  await p2.goto(`${BASE}/map`);
  await p2.waitForSelector(".v2-nearby-list", { timeout: 20000 });
  await p2.waitForTimeout(800);
  const txt = (await p2.locator(".v2-nearby-geo").innerText()).trim();
  if (/不是离你/.test(txt)) ok(`明确告知按尔湾中心排：${txt}`);
  else bad(`没说清「附近」是相对谁：${txt}`);
  const rows = await p2.locator(".v2-nearby-row").count();
  if (rows > 0) ok(`兜底后列表照常可用（${rows} 行）`);
  else bad("兜底后列表空了");
  await ctx2.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
