// 验证 Google 口碑：点 enrich → service-role 查评分是否落库 → 截图一家店详情看 ★ 显示
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,"")]}));
const B="http://localhost:3000";
const SUPA=env.NEXT_PUBLIC_SUPABASE_URL, SVC=env.SUPABASE_SERVICE_ROLE_KEY;
const hdr={apikey:SVC,Authorization:`Bearer ${SVC}`};
const get=async(p)=>(await fetch(`${SUPA}/rest/v1/${p}`,{headers:hdr})).json();
const prof=await get(`profiles?email=eq.${encodeURIComponent(env.E2E_TEST_EMAIL)}&select=id`);
const lists=await get(`lists?owner_id=eq.${prof[0].id}&select=id`);
const listIds=lists.map(l=>l.id).join(",");

const br=await chromium.launch();
const p=await (await br.newContext({viewport:{width:414,height:896}})).newPage();
const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,140))});
await p.goto(`${B}/login`);
await p.locator('input[type=email]').first().fill(env.E2E_TEST_EMAIL);
await p.locator('input[type=password]').first().fill(env.E2E_TEST_PASSWORD);
await p.getByRole("button",{name:/^登录$/}).first().click();
await p.waitForURL(/\/lists/,{timeout:20000});

// V2 默认了，直接去地图点 enrich
await p.goto(`${B}/map`); await p.waitForTimeout(2500);
const btn=p.getByRole("button",{name:/在 Google 上丰富/});
if(await btn.count()){
  console.log("clicking enrich...");
  await btn.click();
  await p.waitForTimeout(30000);
} else { console.log("no enrich button"); }

// 查库里有几家拿到评分
const rated=await get(`places?list_id=in.(${listIds})&google_rating=not.is.null&select=name,google_rating,google_rating_count,dishes&limit=5`);
console.log("rated places:", JSON.stringify(rated.map(r=>({n:r.name,r:r.google_rating,c:r.google_rating_count})).slice(0,5)));

// 截一家有评分的店详情
if(rated.length){
  const one=await get(`places?list_id=in.(${listIds})&google_rating=not.is.null&select=id,list_id&limit=1`);
  await p.goto(`${B}/lists/${one[0].list_id}/places/${one[0].id}`); await p.waitForTimeout(2200);
  await p.screenshot({path:"design-preview/verify-detail-rated.png",fullPage:true});
  console.log("shot detail with rating");
}
console.log("console errors:", errs.length?errs.join(" | "):"none");
await br.close(); console.log("done");
