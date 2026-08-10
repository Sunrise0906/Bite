// 验证「在清单页内智能添加」：目标清单要一路带到确认页并被预选中。
//
// 背景：QuickAddInput（小红书链接 / 长文本 / 拍照 / 语音 / 店名搜索）以前只挂在主页，
// 从清单里加店就只剩 /places/new 那个纯手填表单。想用小红书导入到某个清单，得先回
// 主页粘链接，再在确认页手动把目标清单挑回来。现在清单页里也有智能输入框了。
//
// 目标清单有两条传递路径，都要验：
//   a) 店名搜索  → router.push 带 ?list=<id>
//   b) 文本/小红书/拍照 → 存进草稿的 targetListId（跨 server action 重定向）
// 并且确认页必须**校验该清单确实可写**才采纳（否则等于让 URL 参数指定写入目标）。
//
// 用法：node scripts/verify/add-from-list.mjs（dev server 需在 :3000）

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
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}` };
// 复刻确认页的 writableLists 计算（owner + co_owner，按 created_at 升序）——
// 必须挑一个**不是 writableLists[0]** 的清单当目标，否则「预选生效」和
// 「只是回落到默认第一个」看起来一模一样，测了等于没测。
const allLists = await (
  await fetch(`${SUPA}/rest/v1/lists?select=id,name,owner_id&order=created_at.asc`, { headers: H })
).json();
const memberships = await (
  await fetch(`${SUPA}/rest/v1/list_members?user_id=eq.${auth.user.id}&select=list_id,role`, { headers: H })
).json();
const coOwner = new Set(
  (memberships || []).filter((m) => m.role === "co_owner").map((m) => m.list_id),
);
const writable = (allLists || []).filter(
  (l) => l.owner_id === auth.user.id || coOwner.has(l.id),
);
if (writable.length < 2) {
  console.log(`可写清单只有 ${writable.length} 个，无法做出有意义的预选断言 —— 跳过`);
  process.exit(0);
}
const fallback = writable[0];
const target = writable[writable.length - 1];
console.log(`默认会落到：「${fallback.name}」(${fallback.id.slice(0, 8)}…)`);
console.log(`本次目标：  「${target.name}」(${target.id.slice(0, 8)}…) ← 刻意不是默认那个`);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
await page.getByRole("button", { name: /^登录$/ }).first().click();
await page.waitForURL(/\/lists/, { timeout: 20000 });

// 确认页上被选中的清单
const selectedList = async () => {
  const sel = page.locator('select[name="list_id"], select#list_id').first();
  if (await sel.count()) {
    return (await sel.inputValue().catch(() => null));
  }
  const checked = page.locator('input[name="list_id"]:checked').first();
  if (await checked.count()) return await checked.inputValue();
  return null;
};

console.log("\n[1] 清单页里有智能输入框");
{
  await page.goto(`${BASE}/lists/${target.id}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(900);
  const ta = page.locator('textarea[name="text"]');
  if (await ta.count()) ok("清单页出现 QuickAddInput");
  else bad("清单页没有智能输入框");
  if (await page.getByRole("link", { name: "手动填写" }).count()) ok("手填表单仍可达（手动填写）");
  else bad("手填入口不见了");
}

console.log("\n[2] 店名搜索路径：?list= 带过去并被预选");
{
  await page.goto(`${BASE}/quick-add?placeId=ChIJN1t_tDeuEmsRUsoyG83frY4&list=${target.id}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  const v = await selectedList();
  if (v === target.id) ok(`确认页预选了目标清单（且它不是默认的 ${fallback.name}）`);
  else bad(`确认页选中的是 ${String(v).slice(0, 8)}…，期望 ${target.id.slice(0, 8)}…`);
}

console.log("\n[3] 伪造 ?list= 指向不可写清单 → 必须回退，不能照单全收");
{
  const bogus = "00000000-0000-4000-8000-000000000000";
  await page.goto(`${BASE}/quick-add?placeId=ChIJN1t_tDeuEmsRUsoyG83frY4&list=${bogus}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  const v = await selectedList();
  if (v === fallback.id) ok(`回退到默认可写清单「${fallback.name}」，没采纳伪造值`);
  else if (v && v !== bogus) ok(`回退到可写清单（${String(v).slice(0, 8)}…），没采纳伪造值`);
  else bad(`采纳了不可写的清单 id：${v}`);
}

console.log("\n[4] 文本路径：targetListId 存进草稿并跨重定向生效");
{
  await page.goto(`${BASE}/lists/${target.id}`);
  await page.waitForTimeout(900);
  const ta = page.locator('textarea[name="text"]');
  await ta.fill(
    "海底捞火锅，地址 Irvine Spectrum Center，川味火锅，人均 $40，服务好适合聚会",
  );
  await page.getByRole("button", { name: /识别|添加|解析|提交/ }).first().click()
    .catch(async () => { await ta.press("Enter"); });
  // AI 抽取要几秒
  await page.waitForURL(/\/quick-add/, { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  if (!/\/quick-add/.test(page.url())) {
    bad(`没跳到确认页，停在 ${page.url().replace(BASE, "")}`);
  } else {
    const v = await selectedList();
    if (v === target.id) ok(`走草稿的文本路径也预选了目标清单（不是默认的 ${fallback.name}）`);
    else bad(`文本路径预选的是 ${String(v).slice(0, 8)}…，期望 ${target.id.slice(0, 8)}…`);
    // 不保存，取消掉免得留数据
    await page.getByRole("button", { name: "取消" }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
}

await browser.close();
console.log(`\n${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
