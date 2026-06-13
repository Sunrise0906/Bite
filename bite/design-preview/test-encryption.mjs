// 本地验证 api_key at-rest 加密端到端：
//  1. 登录后在 /profile 存一个 dummy api_key
//  2. 用 service-role 直读 DB → 断言 api_key 是密文（encv1: 前缀）
//  3. 重载 /profile → 断言表单回显的是明文（解密成功）
//  4. cleanup：删掉该 settings 行，恢复默认（不污染账号）
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
const DUMMY = "dummy-test-key-1234567890";

const hdr = { apikey: SVC, Authorization: `Bearer ${SVC}` };
async function svcGet(path) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: hdr });
  return r.json();
}

const profs = await svcGet(
  `profiles?email=eq.${encodeURIComponent(env.E2E_TEST_EMAIL)}&select=id`,
);
const userId = profs[0]?.id;
if (!userId) { console.log("FAIL: 找不到测试账号 user id"); process.exit(1); }

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
let pass = false;
try {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type=email]').first().fill(env.E2E_TEST_EMAIL);
  await page.locator('input[type=password]').first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });

  await page.goto(`${BASE}/profile`);
  await page.waitForTimeout(1000);
  await page.fill("#api_key", DUMMY);
  await page.getByRole("button", { name: /保存设置/ }).click();
  await page.waitForTimeout(2000);

  const rows = await svcGet(
    `user_llm_settings?user_id=eq.${userId}&select=api_key`,
  );
  const stored = rows[0]?.api_key ?? "";
  const isCiphertext = typeof stored === "string" && stored.startsWith("encv1:");
  console.log("DB stored prefix:", stored.slice(0, 12), "| ciphertext:", isCiphertext);

  await page.reload();
  await page.waitForTimeout(1500);
  const shown = await page.inputValue("#api_key");
  const decrypted = shown === DUMMY;
  console.log("form re-shows plaintext:", decrypted);

  pass = isCiphertext && decrypted;
  console.log(pass ? "ENCRYPTION OK (DB=ciphertext, form=plaintext)" : "ENCRYPTION FAIL");
} finally {
  // cleanup：删该行恢复默认
  const r = await fetch(
    `${SUPA}/rest/v1/user_llm_settings?user_id=eq.${userId}`,
    { method: "DELETE", headers: hdr },
  );
  console.log("cleanup delete status:", r.status);
  await browser.close();
}
process.exit(pass ? 0 : 1);
