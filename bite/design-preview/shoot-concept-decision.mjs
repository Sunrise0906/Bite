import { chromium } from "@playwright/test";

const url = "file:///d:/code/dev/IrvinePlay/bite/design-preview/concept-decision.html";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 980 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForTimeout(3500); // fonts + images

// measure: does the rail overflow 1700?
const m = await page.evaluate(() => {
  const rail = document.querySelector(".rail");
  return {
    railScrollW: rail.scrollWidth,
    railClientW: rail.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    cols: document.querySelectorAll(".col").length,
    phones: document.querySelectorAll(".phone").length,
  };
});
console.log("measure:", JSON.stringify(m));

await page.screenshot({ path: "d:/code/dev/IrvinePlay/bite/design-preview/concept-decision.png", fullPage: true });
console.log("shot saved");
await browser.close();
