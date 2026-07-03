// 「一起选」双人匹配流端到端验证（生产站 + 双 E2E 账号）：
//   1. REST 造数据：共享清单里插 2 家想去的测试店
//   2. A 全部右滑 → 进入等待页；B 右滑第一张 → 应立刻出「就它了」
//   3. A 的等待页轮询 4s 内也应翻到「就它了」
//   4. 清理：测试店 + session/votes
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
const BASE = process.env.VERIFY_BASE || "https://bite-sand.vercel.app";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;

async function restLogin(email, password) {
  const r = await (
    await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  ).json();
  if (!r.access_token) throw new Error("login failed: " + email);
  return { jwt: r.access_token, uid: r.user.id };
}

const A = await restLogin(env.E2E_TEST_EMAIL, env.E2E_TEST_PASSWORD);
const B = await restLogin(env.E2E_TEST_EMAIL_2, env.E2E_TEST_PASSWORD_2);
const HA = { apikey: ANON, Authorization: `Bearer ${A.jwt}`, "Content-Type": "application/json" };
const HS = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

// 找 A、B 共同的清单（A 可见且 B 是 owner 或成员）
const membersB = await (await fetch(`${SUPA}/rest/v1/list_members?user_id=eq.${B.uid}&select=list_id`, { headers: HS })).json();
const ownB = await (await fetch(`${SUPA}/rest/v1/lists?owner_id=eq.${B.uid}&select=id`, { headers: HS })).json();
const bLists = new Set([...membersB.map((m) => m.list_id), ...ownB.map((l) => l.id)]);
const membersA = await (await fetch(`${SUPA}/rest/v1/list_members?user_id=eq.${A.uid}&select=list_id`, { headers: HS })).json();
const ownA = await (await fetch(`${SUPA}/rest/v1/lists?owner_id=eq.${A.uid}&select=id`, { headers: HS })).json();
let shared = [...membersA.map((m) => m.list_id), ...ownA.map((l) => l.id)].filter((id) => bLists.has(id));
let createdMembership = false;
let listId;
if (shared.length > 0) {
  listId = shared[0];
} else {
  // 没有现成共享关系：把 B 临时加进 A 的第一个清单（co_owner），测完移除
  if (ownA.length === 0) throw new Error("A 账号没有自己的清单");
  listId = ownA[0].id;
  const r = await fetch(`${SUPA}/rest/v1/list_members`, {
    method: "POST",
    headers: { ...HS, Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ list_id: listId, user_id: B.uid, role: "co_owner", invited_by: A.uid }),
  });
  if (!r.ok) throw new Error("临时共享失败: " + (await r.text()).slice(0, 120));
  createdMembership = true;
}
console.log("共享清单:", listId, createdMembership ? "(临时共享)" : "");

// 插 2 家测试店（A 名义）
const mk = (n) => ({
  list_id: listId, name: `[E2E-PICK] 测试店${n}`, address: "Irvine",
  cuisine: ["测试"], status: "want_to_go", source: "manual", created_by: A.uid,
});
const created = await (await fetch(`${SUPA}/rest/v1/places`, {
  method: "POST", headers: { ...HA, Prefer: "return=representation" },
  body: JSON.stringify([mk(1), mk(2)]),
})).json();
if (!Array.isArray(created) || created.length !== 2) throw new Error("造店失败: " + JSON.stringify(created).slice(0, 150));
const testIds = created.map((p) => p.id);
console.log("测试店:", testIds.length);

const browser = await chromium.launch();
let pass = true;
const check = (name, cond) => { console.log(cond ? "  ✓" : "  ✗", name); if (!cond) pass = false; };

async function loginPage(ctx, email, password) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("input[type=email]").first().fill(email);
  await page.locator("input[type=password]").first().fill(password);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 25000 });
  return page;
}

try {
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pa = await loginPage(ctxA, env.E2E_TEST_EMAIL, env.E2E_TEST_PASSWORD);
  const pb = await loginPage(ctxB, env.E2E_TEST_EMAIL_2, env.E2E_TEST_PASSWORD_2);

  // A：进 pick，右滑所有卡
  await pa.goto(`${BASE}/lists/${listId}/pick`);
  await pa.waitForTimeout(1800);
  const yesA = pa.getByRole("button", { name: "想吃" });
  let safety = 0;
  while ((await yesA.count()) > 0 && safety++ < 15) {
    await yesA.click();
    await pa.waitForTimeout(420); // 等飞卡动画+下一张
  }
  const waitText = await pa.textContent("body");
  check("A 滑完进入等待页", /你滑完了|等对方/.test(waitText ?? ""));

  // B：进 pick，右滑第一张 → 应匹配（A 已右滑全部）
  await pb.goto(`${BASE}/lists/${listId}/pick`);
  await pb.waitForTimeout(1800);
  await pb.getByRole("button", { name: "想吃" }).click();
  await pb.waitForTimeout(1600);
  const bBody = await pb.textContent("body");
  check("B 立刻看到「就它了」", /你们都想吃/.test(bBody ?? ""));
  await pb.screenshot({ path: "design-preview/pick-match-b.png" });

  // A 的等待页轮询（4s 间隔）应在 ~10s 内翻到匹配
  let aMatched = false;
  for (let i = 0; i < 4; i++) {
    await pa.waitForTimeout(4200);
    const t = await pa.textContent("body");
    if (/你们都想吃/.test(t ?? "")) { aMatched = true; break; }
  }
  check("A 轮询后也看到「就它了」", aMatched);
  await pa.screenshot({ path: "design-preview/pick-match-a.png" });
} finally {
  await browser.close();
  // 清理：session/votes（级联）+ 测试店
  const sess = await (await fetch(`${SUPA}/rest/v1/pick_sessions?list_id=eq.${listId}&select=id`, { headers: HS })).json();
  for (const s of sess) {
    await fetch(`${SUPA}/rest/v1/pick_sessions?id=eq.${s.id}`, { method: "DELETE", headers: HS });
  }
  for (const id of testIds) {
    await fetch(`${SUPA}/rest/v1/places?id=eq.${id}`, { method: "DELETE", headers: HS });
  }
  if (createdMembership) {
    await fetch(
      `${SUPA}/rest/v1/list_members?list_id=eq.${listId}&user_id=eq.${B.uid}`,
      { method: "DELETE", headers: HS },
    );
  }
  console.log("cleanup OK（sessions:", sess.length, "places:", testIds.length, "membership:", createdMembership, "）");
}
console.log(pass ? "ALL PASS" : "FAILED");
process.exit(pass ? 0 : 1);
