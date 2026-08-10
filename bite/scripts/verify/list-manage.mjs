// 主页「我的清单 · 管理」模式的端到端验证。
//
// 背景：「管理」曾经是个纯装饰的 <span>（从 V2 主页诞生起就没接过任何东西），
// 主页因此完全没有管理清单的入口。现在它是真的：切管理模式 → 每行给出
// 重命名 / 删除（自己的）或 离开（共享的）。
//
// 这个脚本真的改一次名再改回来，确认写到了库里 —— 光看 UI 出现按钮不算数。
// 破坏性操作（删除/离开）只验确认框会拦，不真跑。
//
// 用法：node scripts/verify/list-manage.mjs（dev server 需在 :3000）

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

// 直接查库确认落盘（不依赖 UI 自己说成功了）
const auth = await (
  await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_TEST_EMAIL, password: env.E2E_TEST_PASSWORD }),
  })
).json();
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}` };
const nameOf = async (id) =>
  (await (await fetch(`${SUPA}/rest/v1/lists?id=eq.${id}&select=name`, { headers: H })).json())[0]?.name;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await ctx.newPage();
let dialogs = 0;
page.on("dialog", (d) => { dialogs++; d.dismiss(); });

await page.goto(`${BASE}/login`);
await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
await page.getByRole("button", { name: /^登录$/ }).first().click();
await page.waitForURL(/\/lists/, { timeout: 20000 });
await page.waitForTimeout(1200);

console.log("\n[1] 「管理」是真控件");
{
  const btn = page.getByRole("button", { name: "管理" });
  if (await btn.count()) ok("是 <button>，可被 role 定位");
  else bad("找不到 button[name=管理] —— 又变回死 span 了？");
  await btn.click();
  await page.waitForTimeout(500);
  if (await page.getByRole("button", { name: "完成" }).count()) ok("点击后切到「完成」");
  else bad("点击后没进入管理模式");
}

console.log("\n[2] 按 owner / 共享 分别给出正确操作");
{
  const rename = await page.getByRole("button", { name: "重命名" }).count();
  const del = await page.getByRole("button", { name: "删除" }).count();
  const leave = await page.getByRole("button", { name: "离开" }).count();
  if (rename > 0 && del === rename) ok(`自己的清单 ${rename} 个：重命名 + 删除`);
  else bad(`重命名(${rename}) 与 删除(${del}) 数量对不上`);
  if (leave > 0) ok(`共享清单 ${leave} 个：离开（不给删除）`);
  else console.log("    – 没有共享清单可验");
}

console.log("\n[3] 破坏性操作必须先确认");
{
  const before = dialogs;
  await page.getByRole("button", { name: "删除" }).first().click();
  await page.waitForTimeout(700);
  if (dialogs > before) ok("点删除弹出确认框（已取消）");
  else bad("删除没有确认框 —— 危险");
  if (await page.getByRole("button", { name: "完成" }).count()) ok("取消后什么都没发生");
  else bad("取消确认后状态异常");
}

console.log("\n[4] 行内重命名真的写库");
{
  // ⚠️ 必须按**下标**锁定行，不能用 filter({has: 重命名按钮})：
  // 点了重命名之后那个按钮就没了，filter 会重新求值而匹配不到同一行。
  const rows = page.locator(".v2-lrow-manage");
  let idx = -1;
  for (let i = 0; i < (await rows.count()); i++) {
    if (await rows.nth(i).getByRole("button", { name: "重命名" }).count()) { idx = i; break; }
  }
  if (idx < 0) { bad("没有可重命名的清单"); await browser.close(); process.exit(1); }
  const row = rows.nth(idx);
  const origName = (await row.locator(".nm").innerText()).split("\n")[0].trim();
  // 从库里按名字反查 id
  const found = await (await fetch(
    `${SUPA}/rest/v1/lists?name=eq.${encodeURIComponent(origName)}&select=id,name`, { headers: H },
  )).json();
  const id = found[0]?.id;
  if (!id) { bad(`库里找不到清单「${origName}」，跳过`); }
  else {
    const tmp = `${origName} ✎改名验证`;
    await row.getByRole("button", { name: "重命名" }).click();
    await page.waitForTimeout(400);
    const input = row.locator('input[name="name"]');
    await input.fill(tmp);
    await row.getByRole("button", { name: "保存" }).click();
    await page.waitForTimeout(2200);

    if ((await nameOf(id)) === tmp) ok(`已写库：「${origName}」→「${tmp}」`);
    else bad(`库里仍是「${await nameOf(id)}」—— 没保存成功`);

    // 改回去
    await page.goto(`${BASE}/lists`);
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "管理" }).click();
    await page.waitForTimeout(500);
    const rows2 = page.locator(".v2-lrow-manage");
    let idx2 = -1;
    for (let i = 0; i < (await rows2.count()); i++) {
      if ((await rows2.nth(i).innerText()).includes(tmp)) { idx2 = i; break; }
    }
    if (idx2 < 0) { bad(`改名后在页面上找不到「${tmp}」`); await browser.close(); process.exit(1); }
    const row2 = rows2.nth(idx2);
    await row2.getByRole("button", { name: "重命名" }).click();
    await page.waitForTimeout(400);
    await row2.locator('input[name="name"]').fill(origName);
    await row2.getByRole("button", { name: "保存" }).click();
    await page.waitForTimeout(2200);
    if ((await nameOf(id)) === origName) ok(`已改回「${origName}」，恢复原状`);
    else bad(`没能改回来！库里现在是「${await nameOf(id)}」—— 需要手动修`);
  }
}

console.log("\n[5] 退出管理模式后恢复成可点击的清单链接");
{
  await page.goto(`${BASE}/lists`);
  await page.waitForTimeout(900);
  const links = await page.locator("a.v2-lrow").count();
  if (links > 0) ok(`默认状态下清单行是链接（${links} 个）`);
  else bad("清单行不再是链接 —— 点不进详情页了");
}

await browser.close();
console.log(`\n${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
