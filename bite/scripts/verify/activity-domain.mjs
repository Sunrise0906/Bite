// 玩乐（activity）领域的抽取适配验证。
//
// 背景：抽取管线原本是纯「吃」形状的 —— prompt 写着「你是一个餐厅信息提取助手」、
// cuisine 描述成「菜系（必填）」、dishes 是「具体菜」。把一篇看展的小红书帖子丢进去，
// 模型会正确地判断「这不是餐厅」而返回空数组，最后报「AI 未返回有效结构化结果」，
// 根本加不进去（实测过）。
//
// 现在：base prompt 领域中立（主页粘玩乐帖也能抽），已知目标清单领域时再追加聚焦段；
// 表单标签跟着**选中的清单**走（菜系 / 品类 / 类型）。存储仍复用同一批列。
//
// 这个脚本建一个临时 activity 清单，从它内部粘一篇看展帖，跑完删掉。
// 用法：node scripts/verify/activity-domain.mjs（dev server 需在 :3000）

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

const POST = `周末去了 The Broad 看展！洛杉矶市中心，草间弥生的无限镜屋一定要预约，
门票免费但特展 $18，建议留 2-3 小时。三楼的 Basquiat 区人少适合拍照。
地址 221 S Grand Ave, Los Angeles。周一闭馆，记得提前在官网抢票。适合情侣和朋友一起去。`;

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

// 临时 activity 清单
const created = await (
  await fetch(`${SUPA}/rest/v1/lists`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      name: "[验证] 玩乐领域",
      owner_id: auth.user.id,
      category: "activity",
    }),
  })
).json();
const listId = created[0]?.id;
if (!listId) { console.log("建临时清单失败：", JSON.stringify(created).slice(0, 200)); process.exit(1); }
console.log(`临时 activity 清单：${listId.slice(0, 8)}…`);

const cleanup = async () => {
  await fetch(`${SUPA}/rest/v1/places?list_id=eq.${listId}`, { method: "DELETE", headers: H });
  await fetch(`${SUPA}/rest/v1/lists?id=eq.${listId}`, { method: "DELETE", headers: H });
};

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 460, height: 1100 } })).newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
  await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });

  console.log("\n[1] 从 activity 清单页粘一篇看展帖");
  await page.goto(`${BASE}/lists/${listId}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(900);
  const ta = page.locator('textarea[name="text"]');
  if (!(await ta.count())) { bad("清单页没有智能输入框"); throw new Error("stop"); }
  await ta.fill(POST);
  await page.waitForTimeout(400);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/quick-add/, { timeout: 90000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  if (!/\/quick-add/.test(page.url())) {
    bad("抽取失败，没进确认页 —— 玩乐帖仍然加不了");
    throw new Error("stop");
  }
  ok("抽取成功，进了确认页（此前这里会报「AI 未返回有效结构化结果」）");

  const val = async (s) => await page.locator(s).first().inputValue().catch(() => "");
  const name = await val('input[name="name"]');
  const type = await val('input[name="cuisine"]');
  const addr = await val('input[name="address"]');

  console.log(`    名称=${name} / 类型=${type} / 地址=${addr.slice(0, 30)}`);

  if (name.includes("Broad")) ok("认出了场馆名 The Broad");
  else bad(`场馆名不对：${name}`);

  const ACTIVITY_WORDS = ["展览", "美术馆", "博物馆", "艺术", "展"];
  if (ACTIVITY_WORDS.some((w) => type.includes(w))) ok(`类型是玩乐词：「${type}」`);
  else bad(`类型不像玩乐：「${type}」`);

  const FOOD_WORDS = ["中餐", "川菜", "粤菜", "火锅", "日料", "美式", "餐厅"];
  if (!FOOD_WORDS.some((w) => type.includes(w))) ok("没有被硬塞成菜系");
  else bad(`被硬塞了菜系词：「${type}」`);

  console.log("\n[2] 字段标签跟着清单领域走");
  const labelText = await page
    .locator("label")
    .filter({ hasText: /^(菜系|品类|类型)\s*\*?$/ })
    .first()
    .innerText()
    .catch(() => "");
  if (/类型/.test(labelText)) ok(`标签显示为「${labelText.trim()}」而不是「菜系」`);
  else bad(`标签仍是「${labelText.trim() || "(没找到)"}」`);

  console.log("\n[3] 目标清单预选到这个 activity 清单");
  const sel = await page.locator('select[name="list_id"]').first().inputValue().catch(() => null);
  if (sel === listId) ok("预选了发起时所在的清单");
  else bad(`预选的是 ${String(sel).slice(0, 8)}…`);

  await page.getByRole("button", { name: "取消" }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
} catch (e) {
  if (String(e.message) !== "stop") console.log("异常：", e.message);
} finally {
  await browser.close();
  await cleanup();
  console.log("\n（已删除临时清单，恢复原状）");
}

console.log(`${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
