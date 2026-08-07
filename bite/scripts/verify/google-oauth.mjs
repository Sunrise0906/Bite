// Google OAuth 链路验证：生产站点「使用 Google 登录」→ 应到达 Google 账号选择/登录页。
// （无头环境完成不了真实 Google 登录——Google 拦自动化——到授权页即证明配置正确）
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
await page.goto(`${process.env.VERIFY_BASE || "http://localhost:3000"}/login`);
await page.getByRole("button", { name: /Google/ }).click();
// server action redirect 链：app → supabase authorize → accounts.google.com
await page.waitForURL(/accounts\.google\.com/, { timeout: 25000 });
await page.waitForTimeout(2500);
const url = page.url();
console.log("landed:", url.slice(0, 90));
const body = await page.textContent("body").catch(() => "");
console.log("页面包含应用名 Bite:", /Bite/.test(body) ? "✓" : "（未见，可能是账号选择页）");
console.log("是登录/授权页:", /Sign in|登录|使用您的 Google/i.test(body) ? "✓" : "?");
await page.screenshot({ path: "screenshots/google-oauth-page.png" });
await browser.close();
console.log("PASS: 已到达 Google 授权页");
