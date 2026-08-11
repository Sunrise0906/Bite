// 「从这个清单里帮我挑」的端到端验证。
//
// 光看 UI 出现按钮不算数 —— 要确认 AI **真的只在这个清单里挑**。
// 做法：建一个临时清单，塞一家名字极其独特的店，从这个清单发起提问，
// 断言回复里出现这家店、且**不出现**别的清单里的店名。
//
// 用法：node scripts/verify/chat-list-scope.mjs（dev server 需在 :3000）

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
const BASE = process.env.VERIFY_BASE || "http://localhost:3000";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };

const auth = await (
  await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_TEST_EMAIL, password: env.E2E_TEST_PASSWORD }),
  })
).json();
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" };
const req = (m, p, b) =>
  fetch(`${SUPA}/rest/v1/${p}`, {
    method: m,
    headers: { ...H, Prefer: "return=representation" },
    body: b === undefined ? undefined : JSON.stringify(b),
  }).then((r) => r.json().catch(() => null));

// 独特到不可能在别处出现的名字
const UNIQ = "泽维尔烤鸭研究所";
const made = await req("POST", "lists", {
  name: "[验证] 清单作用域",
  owner_id: auth.user.id,
  category: "food",
});
const listId = made?.[0]?.id;
if (!listId) { console.log("建清单失败：", JSON.stringify(made).slice(0, 200)); process.exit(1); }
await req("POST", "places", {
  list_id: listId, name: UNIQ, address: "Irvine, CA", cuisine: ["烤鸭"],
  status: "want_to_go", created_by: auth.user.id, source: "manual",
  reasons: [{ user_id: auth.user.id, text: "验证用的店" }],
});
console.log(`临时清单 ${listId.slice(0, 8)}… 里只放了一家：「${UNIQ}」\n`);

const cleanup = async () => {
  await req("DELETE", `places?list_id=eq.${listId}`);
  await req("DELETE", `lists?id=eq.${listId}`);
};

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
  await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 20000 });

  console.log("[1] 清单页有「帮我从这挑」入口");
  {
    await page.goto(`${BASE}/lists/${listId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(900);
    const link = page.getByRole("link", { name: /帮我从这挑/ });
    if (await link.count()) ok("按钮存在");
    else { bad("没有入口"); throw new Error("stop"); }
    const href = await link.first().getAttribute("href");
    if (href === `/chat?list=${listId}`) ok("指向 /chat?list=<该清单>");
    else bad(`href 是 ${href}`);
  }

  console.log("\n[2] 聊天页显示作用域");
  {
    await page.goto(`${BASE}/chat?list=${listId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200);
    if (await page.getByText("从「[验证] 清单作用域」里挑").count()) ok("空状态标题带清单名");
    else bad("空状态没显示作用域");
  }

  console.log("\n[3] AI 真的只在这个清单里挑");
  {
    await page.locator("textarea").first().fill("今晚吃啥？随便推荐一家");
    await page.keyboard.press("Enter");
    // 等流式回复稳定
    // ⚠️ 只读**消息区**，剔掉 aside/nav —— 第一版读了整页，把侧栏里的历史对话
    // 标题（「帮我找两家类似凯悦轩的店」）也算成了 AI 的回复，误报「串清单」。
    // ⚠️ 用 [data-chat-messages] 这个显式钩子定位消息区。
    // 踩过的坑：读整页 → 侧栏的历史对话标题被当成 AI 回复，误报「串清单」；
    // 读 <main> → 聊天页压根没有 main，读到空；
    // 读 .overflow-y-auto → 侧栏也是滚动容器，被优先匹配。
    const readMsgs = () =>
      page.evaluate(() => {
        const box = document.querySelector("[data-chat-messages]");
        if (!box) return "";
        const c = box.cloneNode(true);
        c.querySelectorAll("aside, nav, textarea, header, form").forEach((e) => e.remove());
        return c.innerText;
      });
    let text = "";
    let stable = 0;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1200);
      const t = await readMsgs();
      if (t === text && t.length > 30) { if (++stable >= 2) break; } else stable = 0;
      text = t;
    }
    if (text.includes(UNIQ)) ok(`回复里提到了「${UNIQ}」`);
    else bad(`回复里没提到「${UNIQ}」—— 作用域可能没生效\n     回复片段：${text.slice(-260).replace(/\s+/g, " ")}`);

    // 作用域必须存到会话行上 —— 否则首条消息后 URL 被 replace 就丢了
    const convo = await req(
      "GET",
      `conversations?scope_list_id=eq.${listId}&select=id&limit=1`,
    );
    if (convo && convo.length > 0) ok("作用域已持久化到会话（刷新/翻历史也不丢）");
    else bad("scope_list_id 没存上 —— 第二条消息就会失去作用域");

    // 别的清单里的店不该出现
    const others = await req("GET", `places?list_id=neq.${listId}&select=name&limit=40`);
    const leaked = (others ?? []).map((p) => p.name).filter((n) => n && n.length > 2 && text.includes(n));
    if (leaked.length === 0) ok("没有串到别的清单的店");
    else bad(`串到了别的清单：${leaked.slice(0, 3).join(" / ")}`);
  }
} catch (e) {
  if (String(e.message) !== "stop") console.log("异常：", e.message);
} finally {
  await browser.close();
  await cleanup();
  console.log("\n（已删除临时清单与店）");
}

console.log(`${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
