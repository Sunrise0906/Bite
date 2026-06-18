// 审查：截图剩余屏在 V2 下的真实状态
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,"")]}));
const B="http://localhost:3000";
const br=await chromium.launch();
const p=await (await br.newContext({viewport:{width:414,height:896}})).newPage();
await p.goto(`${B}/login`);
await p.locator('input[type=email]').first().fill(env.E2E_TEST_EMAIL);
await p.locator('input[type=password]').first().fill(env.E2E_TEST_PASSWORD);
await p.getByRole("button",{name:/^登录$/}).first().click();
await p.waitForURL(/\/lists/,{timeout:20000});
await p.goto(`${B}/profile`); await p.waitForTimeout(1000);
await p.getByRole("button",{name:/V2 新版/}).click(); await p.waitForTimeout(1500);

for (const [path,name] of [["/profile","rev-profile"],["/recommendations","rev-recs"],["/quick-add","rev-quickadd"]]) {
  await p.goto(`${B}${path}`); await p.waitForTimeout(1800);
  await p.screenshot({path:`design-preview/${name}.png`,fullPage:true});
  console.log("shot",name);
}
// 不切回，留 V2 方便后续（但为不污染，最后切回）
await p.goto(`${B}/profile`); await p.waitForTimeout(800);
await p.getByRole("button",{name:/V1 经典/}).click(); await p.waitForTimeout(1000);
await br.close(); console.log("done");
