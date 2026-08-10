// 上线前防回归探针：覆盖 5 个「tsc/lint/单测/e2e 全绿也发现不了」的 bug。
// 全是级联 / 隐式提交 / 跨 provider 语义这类问题，只能用真浏览器量。
//
// 用法：node scripts/verify/deploy-guard.mjs（dev server 需在 :3000）

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
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };

const browser = await chromium.launch();

async function login(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
  await p.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
  await p.getByRole("button", { name: /^登录$/ }).first().click();
  await p.waitForURL(/\/lists/, { timeout: 20000 });
  return p;
}

// ── 1. 按钮文字对比度：.ui-v2 a{color:inherit} 不得吃掉 .btn-primary 的 color ──
console.log("\n[1] 落地页 CTA 按钮文字色（.ui-v2 a{color:inherit} 级联）");
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`);
  const r = await p.evaluate(() => {
    const a = document.querySelector("a.btn-primary");
    if (!a) return null;
    const cs = getComputedStyle(a);
    const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const L1 = lum(parse(cs.color)), L2 = lum(parse(cs.backgroundColor));
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    return { color: cs.color, bg: cs.backgroundColor, ratio: Math.round(ratio * 100) / 100 };
  });
  if (!r) { bad(`${scheme}: 找不到 a.btn-primary`); continue; }
  // 白字压主色，正常应 > 4；出 bug 时深色模式下会掉到 ~1.6
  if (r.ratio >= 4) ok(`${scheme}: 对比度 ${r.ratio}:1（${r.color} on ${r.bg}）`);
  else bad(`${scheme}: 对比度只有 ${r.ratio}:1 —— 按钮文字看不清（${r.color} on ${r.bg}）`);
  await ctx.close();
}

// ── 2. 正文字体：body 的 font-family 声明不得挡住 .ui-v2 的字体 ──
console.log("\n[2] 正文字体仍是 Inter（body 自带 font-family 会挡住继承）");
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  const ff = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  if (/inter/i.test(ff)) ok(`body font-family 含 Inter（${ff.slice(0, 60)}…）`);
  else bad(`body 掉回系统字体：${ff.slice(0, 80)}`);
  await ctx.close();
}

// ── 3. 确认页按 Enter 必须是「保存」而不是「取消」 ──
console.log("\n[3] quick-add 确认页：文本框按 Enter 不得丢草稿");
{
  const ctx = await browser.newContext();
  const p = await login(ctx);
  await p.goto(`${BASE}/quick-add?placeId=ChIJN1t_tDeuEmsRUsoyG83frY4`);
  await p.waitForLoadState("networkidle").catch(() => {});
  const which = await p.evaluate(() => {
    const form = document.querySelector("form");
    if (!form) return "no-form";
    // 隐式提交激活的是 tree order 上第一个 submit 按钮
    const first = form.querySelector(
      'button[type="submit"]:not([disabled]), button:not([type]):not([disabled])',
    );
    return first ? first.textContent.trim().slice(0, 12) : "none";
  });
  if (which.includes("取消")) bad(`默认提交按钮是「${which}」—— 按 Enter 会清掉草稿！`);
  else ok(`默认提交按钮是「${which}」（不是取消）`);

  // 视觉顺序仍应是 取消 在左
  const order = await p.evaluate(() => {
    const bs = [...document.querySelectorAll("form button")].filter((b) =>
      /取消|确认添加|覆盖更新|保存/.test(b.textContent),
    );
    return bs
      .map((b) => ({ t: b.textContent.trim().slice(0, 6), x: b.getBoundingClientRect().left }))
      .sort((a, b) => a.x - b.x)
      .map((o) => o.t);
  });
  if (order[0] && order[0].includes("取消")) ok(`视觉顺序仍是取消在左：${order.join(" | ")}`);
  else bad(`视觉顺序变了：${order.join(" | ")}`);
  await ctx.close();
}

// ── 4+5. 换 provider 时留空不得继承旧 key ──
console.log("\n[4] 换 LLM provider 时留空 → 旧 key 必须被清掉");
if (!SVC) {
  console.log("  – 跳过（无 SUPABASE_SERVICE_ROLE_KEY，无法直读 DB 验证）");
} else {
  const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
  const ctx = await browser.newContext();
  const p = await login(ctx);
  const uid = await p.evaluate(() => null).then(async () => {
    const r = await fetch(`${SUPA}/rest/v1/profiles?email=eq.${encodeURIComponent(env.E2E_TEST_EMAIL)}&select=id`, { headers: H });
    return (await r.json())[0]?.id;
  });

  await p.goto(`${BASE}/profile`);
  await p.waitForTimeout(800);
  // 存一把「Anthropic」的 key
  await p.getByText("Anthropic Claude").click();
  await p.waitForTimeout(300);
  await p.fill("#api_key", "sk-ant-deploy-guard-test-123456");
  await p.getByRole("button", { name: /保存设置/ }).click();
  await p.waitForTimeout(2000);

  let row = await (await fetch(`${SUPA}/rest/v1/user_llm_settings?user_id=eq.${uid}&select=provider,api_key`, { headers: H })).json();
  const storedOk = row[0]?.provider === "anthropic" && row[0]?.api_key;
  console.log(`  （前置：已存 provider=${row[0]?.provider} key=${row[0]?.api_key ? "有" : "无"}）`);

  // 换成 Gemini，key 框留空，直接保存
  await p.reload();
  await p.waitForTimeout(1000);
  await p.getByText("Google Gemini").click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /保存设置/ }).click();
  await p.waitForTimeout(2000);

  row = await (await fetch(`${SUPA}/rest/v1/user_llm_settings?user_id=eq.${uid}&select=provider,api_key`, { headers: H })).json();
  const after = row[0];
  if (!storedOk) bad("前置条件没建立（没能先存上 anthropic key）");
  else if (after?.provider === "gemini" && after?.api_key === null)
    ok("换成 gemini 后旧 key 已清空（api_key=null，走 app 默认额度）");
  else
    bad(`换成 ${after?.provider} 后 api_key=${after?.api_key ? "仍然是旧的！" : after?.api_key}`);

  // 清理
  await fetch(`${SUPA}/rest/v1/user_llm_settings?user_id=eq.${uid}`, { method: "DELETE", headers: H });
  console.log("  （已清理测试设置行）");
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
