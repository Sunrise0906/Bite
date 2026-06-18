import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const keys = ["editorial", "decision", "cozy"];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1720, height: 900 }, deviceScaleFactor: 2 });

for (const k of keys) {
  const f = `d:/code/dev/IrvinePlay/bite/design-preview/concept-${k}.html`;
  if (!existsSync(f)) { console.log("MISSING:", k); continue; }
  await page.goto(`file:///${f}`);
  await page.waitForTimeout(3500); // 字体 + Unsplash 图
  await page.screenshot({
    path: `d:/code/dev/IrvinePlay/bite/design-preview/concept-${k}.png`,
    fullPage: true,
  });
  console.log("shot:", k);
}
await browser.close();
console.log("done");
