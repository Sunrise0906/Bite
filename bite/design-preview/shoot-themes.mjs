// 给主题原型每个主题截一张图（含 4 个界面）
import { chromium } from "@playwright/test";

const url = "file:///d:/code/dev/IrvinePlay/bite/design-preview/theme-prototype.html";
const themes = ["terracotta", "minimal", "dark", "vibrant"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 900 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForTimeout(3000); // 等字体 + 图片

for (const t of themes) {
  await page.evaluate((theme) => {
    document.body.setAttribute("data-theme", theme);
  }, t);
  await page.waitForTimeout(1200);
  // 截 stage 区域（4 个手机）
  const stage = page.locator(".stage");
  await stage.screenshot({
    path: `d:/code/dev/IrvinePlay/bite/design-preview/theme-${t}.png`,
  });
  console.log("shot:", t);
}
await browser.close();
console.log("done");
