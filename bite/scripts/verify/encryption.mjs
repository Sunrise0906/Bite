// 本地验证 api_key 的存储与回显契约：
//  1. 登录后在 /profile 存一个 dummy api_key
//  2. 用 service-role 直读 DB → 断言是密文（encv1: 前缀）
//  3. 重载 /profile → 断言表单**不回显**明文，只给一个「已保存」占位符
//     ⚠️ 这一条以前是反的（断言回显明文）。回显明文意味着加密存储形同虚设：
//        key 会随每次普通页面浏览进 RSC payload / HTML / bfcache / devtools。
//        现在的契约是「留空 = 不改动」，要清空得显式点「清除」。
//  4. 断言留空保存**不会**把已存的 key 洗掉（三态语义的关键一条）
//  5. cleanup：删掉该 settings 行，恢复默认（不污染账号）
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
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

  // 表单不得回显明文
  const shown = await page.inputValue("#api_key");
  const notEchoed = shown === "";
  console.log(`表单不回显明文: ${notEchoed}${notEchoed ? "" : `（实际='${shown}'）`}`);

  // 但要让用户知道「已经存了一把」
  const ph = await page.getAttribute("#api_key", "placeholder");
  const hintsSaved = Boolean(ph && ph.includes("已保存"));
  console.log("占位符提示已保存:", hintsSaved, `（'${ph}'）`);

  // 页面 HTML 里任何地方都不该出现明文 key
  const html = await page.content();
  const notInPayload = !html.includes(DUMMY);
  console.log("整页 HTML/RSC payload 不含明文:", notInPayload);

  // 留空保存 → 不应清掉已存的 key
  await page.getByRole("button", { name: /保存设置/ }).click();
  await page.waitForTimeout(2000);
  const after = await svcGet(
    `user_llm_settings?user_id=eq.${userId}&select=api_key`,
  );
  const stillThere =
    typeof after[0]?.api_key === "string" && after[0].api_key.startsWith("encv1:");
  console.log("留空保存后 key 仍在:", stillThere);

  pass = isCiphertext && notEchoed && hintsSaved && notInPayload && stillThere;
  console.log(
    pass
      ? "ENCRYPTION OK（DB=密文 / 表单不回显 / 留空不清空）"
      : "ENCRYPTION FAIL",
  );
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
