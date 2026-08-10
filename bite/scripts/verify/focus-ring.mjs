// 无障碍回归：每一个文本输入控件聚焦时**必须**有可见变化，且**不能**出现双层框。
//
// 背景：globals.css 的全局 `:focus-visible { outline: 2px solid var(--primary) }` 是
// unlayered 的，会压过 Tailwind 的 outline-none；而文本框用鼠标点击也会匹配
// :focus-visible。于是自带 focus 设计的输入框（.field-input:focus 的描边+柔光，
// 或外层 focus-within:ring）会再叠一圈对不上圆角的 outline —— 就是那个「难看的红框」。
// 修法是把文本类控件排除出全局规则，但排除之后必须保证它们各自仍有可见焦点反馈，
// 否则就是把一个视觉问题换成了一个无障碍问题。这个脚本盯的就是这条底线。
//
// 用法：node scripts/verify/focus-ring.mjs（dev server 需在 :3000）

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

let pass = 0, fail = 0;
const ok = (m) => { console.log(`    ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`    ✗ ${m}`); fail++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`);
await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
await page.getByRole("button", { name: /^登录$/ }).first().click();
await page.waitForURL(/\/lists/, { timeout: 20000 });

const listHref = await page.locator("a.v2-lrow").first().getAttribute("href");
const PAGES = [
  ["/lists", "主页（quick-add 输入框）"],
  [listHref, "清单详情（搜索框）"],
  ["/chat", "聊天（消息输入）"],
  ["/profile", "我的（各种设置字段）"],
];

// 聚焦前后各量一次；把控件自身和它最近三层祖先的关键样式都拍下来
const SNAP = `(el) => {
  const of = (n) => { const c = getComputedStyle(n); return [c.outlineStyle,c.outlineColor,c.outlineWidth,c.borderColor,c.boxShadow,c.backgroundColor].join("|"); };
  const parts = [of(el)];
  let n = el.parentElement;
  for (let i = 0; i < 3 && n; i++) { parts.push(of(n)); n = n.parentElement; }
  return parts;
}`;

for (const [href, label] of PAGES) {
  if (!href) continue;
  console.log(`\n[${label}] ${href}`);
  await page.goto(`${BASE}${href}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(900);

  const fields = await page.$$(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]), textarea:not([disabled])',
  );
  if (fields.length === 0) { console.log("    – 本页没有文本输入控件"); continue; }

  for (const el of fields) {
    if (!(await el.isVisible().catch(() => false))) continue;
    const name =
      (await el.getAttribute("name")) ||
      (await el.getAttribute("id")) ||
      (await el.getAttribute("placeholder"))?.slice(0, 14) ||
      (await el.evaluate((n) => n.tagName.toLowerCase()));

    const before = await el.evaluate(new Function("el", `return (${SNAP})(el)`));
    await el.focus();
    await page.waitForTimeout(220);
    const after = await el.evaluate(new Function("el", `return (${SNAP})(el)`));

    // 1) 必须有可见变化（自身或祖先任一层）
    const changed = before.some((b, i) => b !== after[i]);
    // 2) 自身不得出现实心 outline —— 那就是那圈多余的框
    const selfOutline = await el.evaluate((n) => {
      const c = getComputedStyle(n);
      return c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0;
    });

    if (!changed) bad(`${name}：聚焦后毫无视觉变化（无障碍回归！）`);
    else if (selfOutline) bad(`${name}：自身仍有一圈 outline —— 双层框还在`);
    else ok(`${name}：有焦点反馈，且无多余 outline`);

    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(80);
  }
}

// checkbox 仍应保留全局焦点环
console.log("\n[checkbox 仍需保留焦点环]");
{
  await page.goto(`${BASE}/profile`);
  await page.waitForTimeout(700);
  const cb = await page.$('input[type=checkbox]:not([disabled])');
  if (!cb) console.log("    – 本页没有 checkbox，跳过");
  else {
    await cb.focus();
    await page.waitForTimeout(200);
    const hasRing = await cb.evaluate((n) => {
      const c = getComputedStyle(n);
      return c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0;
    });
    if (hasRing) ok("checkbox 仍有焦点环");
    else bad("checkbox 焦点环被误伤");
  }
}

await browser.close();
console.log(`\n${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
