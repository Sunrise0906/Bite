// 本地验证拍照上传端到端：登录 → 新增店铺页 → 通过隐藏 file input 传一张 1x1 PNG
// → 断言 photo_urls_text 里出现 supabase storage public URL → service-role 删测试文件清理。
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const BASE = "http://localhost:3000";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;

// 1x1 透明 PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
let pass = false;
let uploadedPath = null;
try {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type=email]').first().fill(env.E2E_TEST_EMAIL);
  await page.locator('input[type=password]').first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });

  // 进第一个 list → 新增店铺
  await page.goto(`${BASE}/lists`);
  await page.waitForTimeout(1500);
  const href = await page.locator('a[href^="/lists/"]').first().getAttribute("href");
  const listId = href.split("/lists/")[1].split(/[/?]/)[0];
  await page.goto(`${BASE}/lists/${listId}/places/new`);
  await page.waitForTimeout(1500);

  // 直接给隐藏的 file input 喂文件
  const fileInput = page.locator('input[type=file]').first();
  await fileInput.setInputFiles({
    name: "e2e-test-pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_B64, "base64"),
  });

  // 等上传完成：photo_urls_text 出现 storage public URL
  // （该 textarea 是 hidden——PlaceForm 折叠了手动编辑，靠 PhotoUpload UI 操作；
  //  inputValue 对 hidden 元素照样可读）
  const textarea = page.locator('textarea[name="photo_urls_text"]');
  await textarea.waitFor({ state: "attached", timeout: 10000 });
  let val = "";
  for (let i = 0; i < 20; i++) {
    val = await textarea.inputValue();
    if (val.includes("/storage/v1/object/public/photos/")) break;
    await page.waitForTimeout(500);
  }
  const ok = val.includes("/storage/v1/object/public/photos/");
  console.log("uploaded URL present:", ok);
  if (ok) {
    const m = val.match(/\/storage\/v1\/object\/public\/photos\/([^\s\n]+)/);
    uploadedPath = m ? decodeURIComponent(m[1]) : null;
    console.log("path:", uploadedPath);
  }
  pass = ok;
  console.log(pass ? "PHOTO UPLOAD OK" : "PHOTO UPLOAD FAIL");
} finally {
  // cleanup：删本次 + 历史遗留的所有 e2e-test-pixel 测试文件（按账号 folder 列举）
  try {
    const profs = await (
      await fetch(
        `${SUPA}/rest/v1/profiles?email=eq.${encodeURIComponent(env.E2E_TEST_EMAIL)}&select=id`,
        { headers: { Authorization: `Bearer ${SVC}`, apikey: SVC } },
      )
    ).json();
    const uid = profs[0]?.id;
    if (uid) {
      const listed = await (
        await fetch(`${SUPA}/storage/v1/object/list/photos`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SVC}`,
            apikey: SVC,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prefix: `${uid}/`, limit: 100 }),
        })
      ).json();
      const stale = (listed || [])
        .filter((o) => o.name && o.name.includes("e2e-test-pixel"))
        .map((o) => `${uid}/${o.name}`);
      for (const p of stale) {
        const r = await fetch(`${SUPA}/storage/v1/object/photos/${p}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${SVC}`, apikey: SVC },
        });
        console.log("cleanup:", p, "->", r.status);
      }
      if (stale.length === 0) console.log("cleanup: 无遗留测试文件");
    }
  } catch (e) {
    console.log("cleanup err:", e.message);
  }
  await browser.close();
}
process.exit(pass ? 0 : 1);
