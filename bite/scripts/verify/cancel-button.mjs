// 回归：quick-add 确认页的「取消」按钮必须真的能取消。
//
// 背景：这个按钮靠 <button formAction={cancelQuickAdd}>。而 formAction 只在
// type="submit"（或不写 type）时生效——历史上它写的是 type="button"，React 会
// 警告并忽略 formAction，于是「取消」是个点了没反应的死按钮。tsc / lint / 单测
// 全都发现不了（只有 dev server 日志里一行 React 警告）。
//
// 用法：node scripts/verify/cancel-button.mjs（dev server 需在 :3000）
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../../.env.local", import.meta.url),"utf8")
  .split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#"))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,"")]}));
const BASE="http://localhost:3000";
const b=await chromium.launch();
const ctx=await b.newContext(); const p=await ctx.newPage();
await p.goto(`${BASE}/login`);
await p.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
await p.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
await p.getByRole("button",{name:/^登录$/}).first().click();
await p.waitForURL(/\/lists/,{timeout:20000});

// 用一个已知的 Google place id 直接进确认页（绕过 autocomplete）
await p.goto(`${BASE}/quick-add?placeId=ChIJN1t_tDeuEmsRUsoyG83frY4`);
await p.waitForLoadState("networkidle");
const title = await p.locator("h1").first().textContent().catch(()=>null);
console.log("确认页标题:", JSON.stringify(title));

const cancel = p.getByRole("button",{name:"取消"});
const n = await cancel.count();
console.log("找到「取消」按钮:", n);
if (n>0) {
  const before = p.url();
  await cancel.first().click();
  await p.waitForTimeout(2500);
  const after = p.url();
  console.log("点击前:", before.replace(BASE,""));
  console.log("点击后:", after.replace(BASE,""));
  console.log(after.includes("/lists") && !after.includes("quick-add")
    ? "✓ 取消可用（跳回 /lists）" : "✗ 取消无效（URL 没变）");
}
await b.close();
