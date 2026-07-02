// 端到端验证 signed URL 渲染不变量：
//   1. 上传一张 Storage 图 + 建一家 photo_urls=[canonical] 的测试店
//   2. 展示页（V2 主页 / 清单详情 / 店铺详情）的 HTML 里应出现 /object/sign/（signed）
//   3. 编辑页 textarea 里必须还是 canonical（/object/public/），img 预览是 signed
//   4. 清理店 + 对象
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("file:///d:/code/dev/IrvinePlay/bite/.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const BASE = "http://localhost:3000";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ---- REST 准备数据 ----
const auth = await (
  await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_TEST_EMAIL, password: env.E2E_TEST_PASSWORD }),
  })
).json();
const JWT = auth.access_token;
const uid = auth.user.id;
const H = { apikey: ANON, Authorization: `Bearer ${JWT}` };

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const objPath = `${uid}/verify-signed-render.png`;
await fetch(`${SUPA}/storage/v1/object/photos/${objPath}`, {
  method: "POST",
  headers: { ...H, "Content-Type": "image/png", "x-upsert": "true" },
  body: PNG,
});
const canonical = `${SUPA}/storage/v1/object/public/photos/${objPath}`;

// 找一个自己的 list
const lists = await (
  await fetch(`${SUPA}/rest/v1/lists?owner_id=eq.${uid}&select=id&limit=1`, { headers: H })
).json();
const listId = lists[0]?.id;
if (!listId) throw new Error("E2E 账号没有 list");

const placeRes = await (
  await fetch(`${SUPA}/rest/v1/places`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      list_id: listId,
      name: "[E2E] SignedRender 测试店",
      address: "Irvine",
      cuisine: ["测试"],
      status: "want_to_go",
      photo_urls: [canonical],
      source: "manual",
      created_by: uid,
    }),
  })
).json();
const placeId = placeRes[0]?.id;
if (!placeId) throw new Error("建店失败: " + JSON.stringify(placeRes).slice(0, 200));
console.log("setup OK, place =", placeId);

// ---- 浏览器断言 ----
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
let pass = true;
const check = (name, cond) => {
  console.log(cond ? "  ✓" : "  ✗", name);
  if (!cond) pass = false;
};

try {
  await page.goto(`${BASE}/login`);
  await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
  await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });

  // 1. V2 主页
  await page.goto(`${BASE}/lists`);
  await page.waitForTimeout(1200);
  let html = await page.content();
  console.log("V2 主页:");
  check("出现 signed URL", html.includes("/object/sign/photos/"));
  check("没把 canonical 直接当 img 用（thumbs 区）", !html.includes(`url('${canonical}')`) && !html.includes(`url("${canonical}")`));

  // 2. 清单详情
  await page.goto(`${BASE}/lists/${listId}`);
  await page.waitForTimeout(1200);
  html = await page.content();
  console.log("清单详情:");
  check("出现 signed URL", html.includes("/object/sign/photos/"));

  // 3. 店铺详情（V2）
  await page.goto(`${BASE}/lists/${listId}/places/${placeId}`);
  await page.waitForTimeout(1200);
  html = await page.content();
  console.log("店铺详情:");
  check("hero 是 signed URL", html.includes("/object/sign/photos/"));

  // 4. 编辑页：textarea = canonical，img = signed
  await page.goto(`${BASE}/lists/${listId}/places/${placeId}/edit`);
  await page.waitForTimeout(1200);
  const taVal = await page.locator('textarea[name="photo_urls_text"]').inputValue();
  console.log("编辑页:");
  check("textarea 保持 canonical", taVal.trim() === canonical);
  const imgSrc = await page.locator("img").first().getAttribute("src");
  check("预览 img 是 signed", (imgSrc ?? "").includes("/object/sign/photos/"));
  const imgResp = await page.evaluate(async (src) => (await fetch(src)).status, imgSrc);
  check("signed img 可取回 (200)", imgResp === 200);
} finally {
  await browser.close();
  // ---- 清理 ----
  await fetch(`${SUPA}/rest/v1/places?id=eq.${placeId}`, { method: "DELETE", headers: H });
  await fetch(`${SUPA}/storage/v1/object/photos/${objPath}`, { method: "DELETE", headers: H });
  console.log("cleanup OK");
}
console.log(pass ? "ALL PASS" : "FAILED");
process.exit(pass ? 0 : 1);
