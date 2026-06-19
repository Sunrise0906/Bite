// 端到端：加一家带菜名的真实店 → 验 dishes 抽取 + 自动 enrich 评分 → 清理
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,"")]}));
const B="http://localhost:3000";
const SUPA=env.NEXT_PUBLIC_SUPABASE_URL, SVC=env.SUPABASE_SERVICE_ROLE_KEY;
const hdr={apikey:SVC,Authorization:`Bearer ${SVC}`,"Content-Type":"application/json"};
const get=async(p)=>(await fetch(`${SUPA}/rest/v1/${p}`,{headers:hdr})).json();

const TEXT="In-N-Out Burger，Irvine。美式汉堡，招牌 Double-Double 必点，奶昔也好喝。";

const br=await chromium.launch();
const p=await (await br.newContext({viewport:{width:414,height:896}})).newPage();
await p.goto(`${B}/login`);
await p.locator('input[type=email]').first().fill(env.E2E_TEST_EMAIL);
await p.locator('input[type=password]').first().fill(env.E2E_TEST_PASSWORD);
await p.getByRole("button",{name:/^登录$/}).first().click();
await p.waitForURL(/\/lists/,{timeout:20000});

// 在主页输入框粘文本 → 用 AI 解析
await p.goto(`${B}/lists`); await p.waitForTimeout(1500);
await p.locator('textarea[name="text"]').first().fill(TEXT);
await p.waitForTimeout(800);
await p.getByRole("button",{name:/用 AI 解析/}).click();
await p.waitForURL(/\/quick-add/,{timeout:45000});
await p.waitForTimeout(1500);
console.log("at confirm page");
// 提交确认（list 默认选好）
await p.getByRole("button",{name:/确认添加|^添加$|保存/}).first().click();
await p.waitForURL(/\/lists\/[0-9a-f-]+/,{timeout:20000});
await p.waitForTimeout(2000);
console.log("saved, at", p.url());

// 查新加的店
const prof=await get(`profiles?email=eq.${encodeURIComponent(env.E2E_TEST_EMAIL)}&select=id`);
const lists=await get(`lists?owner_id=eq.${prof[0].id}&select=id`);
const listIds=lists.map(l=>l.id).join(",");
const rows=await get(`places?list_id=in.(${listIds})&name=ilike.*N-Out*&select=id,name,dishes,google_rating,google_rating_count,lat,cuisine&order=created_at.desc&limit=1`);
const r=rows[0];
console.log("ADDED:", JSON.stringify({name:r?.name,dishes:r?.dishes,rating:r?.google_rating,count:r?.google_rating_count,hasCoord:r?.lat!=null,cuisine:r?.cuisine}));
const dishesOk=(r?.dishes?.length??0)>0;
const ratingOk=r?.google_rating!=null;
console.log(`dishes 抽取: ${dishesOk?"OK":"空"} | 自动评分: ${ratingOk?"OK":"无"}`);

// 清理：删掉测试店
if(r?.id){ const d=await fetch(`${SUPA}/rest/v1/places?id=eq.${r.id}`,{method:"DELETE",headers:hdr}); console.log("cleanup:",d.status); }
await br.close(); console.log("done");
