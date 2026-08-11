// 三批改动的端到端验证：加店合并归一化 / 3 人共享 / 清单内评论。
//
// 这里只验**单测覆盖不到的接线**：RLS 真的放行了吗、UI 真的把提示显示出来了吗、
// server action 真的写进库了吗。纯逻辑（normalizeName、buildUpsertPlan、
// votesNeeded、isActive）已经有 370 个单测，不在这里重复。
//
// 用法：node scripts/verify/social-batch.mjs（dev server 需在 :3000）
//   跑生产：VERIFY_BASE=https://bite-sand.vercel.app node scripts/verify/social-batch.mjs

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

async function login(email, password) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  return {
    token: j.access_token,
    userId: j.user?.id,
    H: {
      apikey: ANON,
      Authorization: `Bearer ${j.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

const me = await login(env.E2E_TEST_EMAIL, env.E2E_TEST_PASSWORD);
const friend = env.E2E_TEST_EMAIL_2
  ? await login(env.E2E_TEST_EMAIL_2, env.E2E_TEST_PASSWORD_2)
  : null;

// 临时清单，跑完删掉
const STAMP = `verify-social-${me.userId.slice(0, 6)}-${process.pid}`;
const [list] = await (
  await fetch(`${SUPA}/rest/v1/lists`, {
    method: "POST",
    headers: { ...me.H, Prefer: "return=representation" },
    body: JSON.stringify({ name: STAMP, owner_id: me.userId, category: "food" }),
  })
).json();

async function cleanup() {
  await fetch(`${SUPA}/rest/v1/lists?id=eq.${list.id}`, {
    method: "DELETE",
    headers: me.H,
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1200 } });
const page = await ctx.newPage();
try {
  await page.goto(`${BASE}/login`);
  await page.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL);
  await page.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: /^登录$/ }).first().click();
  await page.waitForURL(/\/lists/, { timeout: 30000 });

  // ---------- A：归一化去重 ----------
  console.log("\n[A] 店名归一化：MOri’s 和 MOri's 是同一家");
  {
    const newUrl = `${BASE}/lists/${list.id}/places/new`;
    const create = async (name) => {
      await page.goto(newUrl);
      await page.locator("input[name=name]").fill(name);
      await page.locator("input[name=address]").fill("Irvine, CA");
      await page.locator("input[name=cuisine]").fill("咖啡");
      await page.getByRole("button", { name: /保存|添加|创建/ }).first().click();
      await page.waitForTimeout(1500);
    };

    // 第一家：弯撇号 U+2019（iOS 智能标点打出来的就是这个）
    await create("MOri’s");
    let rows = await (
      await fetch(
        `${SUPA}/rest/v1/places?list_id=eq.${list.id}&select=id,name`,
        { headers: me.H },
      )
    ).json();
    if (rows.length === 1) ok(`第一家已建：${JSON.stringify(rows[0].name)}`);
    else bad(`第一家没建上（${rows.length} 行）`);

    // 第二家：ASCII 撇号 + 不同大小写 —— 以前会静默新建一条重复记录
    await create("mori's");
    rows = await (
      await fetch(
        `${SUPA}/rest/v1/places?list_id=eq.${list.id}&select=id,name`,
        { headers: me.H },
      )
    ).json();
    if (rows.length === 1) ok("直撇号 + 小写没有再建一条（库里仍然只有 1 行）");
    else bad(`又建了一条重复记录，现在 ${rows.length} 行：${rows.map((r) => r.name).join(" / ")}`);

    const body = await page.locator("body").innerText();
    if (/已经有「MOri’s」了/.test(body)) ok("页面明确告诉用户「这个清单里已经有…了」");
    else bad(`没给出重复提示，页面上是：${body.slice(0, 120).replace(/\n/g, " ")}`);
  }

  const [place] = await (
    await fetch(`${SUPA}/rest/v1/places?list_id=eq.${list.id}&select=id,name`, {
      headers: me.H,
    })
  ).json();

  // ---------- C：评论 ----------
  console.log("\n[C] 清单内评论");
  {
    await page.goto(`${BASE}/lists/${list.id}/places/${place.id}`);
    await page.waitForSelector(".v2-comments", { timeout: 20000 });

    const sys = await page.locator(".v2-cmt.sys").innerText().catch(() => "");
    if (/加了这家店/.test(sys)) ok(`「谁加的」显示出来了：${sys.replace(/\n/g, " ").trim()}`);
    else bad("没有显示「谁加了这家店」（created_by 依然没被读出来）");

    const msg = `验证留言 ${Date.now()}`;
    await page.locator(".v2-cmt-compose textarea").fill(msg);
    await page.getByRole("button", { name: /^发送$/ }).click();
    await page.waitForTimeout(2000);

    const shown = await page.locator(".v2-cmt:not(.sys) .body").allInnerTexts();
    if (shown.includes(msg)) ok("留言即时出现在页面上");
    else bad(`留言没出现，页面上有：${shown.join(" | ") || "(空)"}`);

    const saved = await (
      await fetch(
        `${SUPA}/rest/v1/place_comments?place_id=eq.${place.id}&select=body,user_id`,
        { headers: me.H },
      )
    ).json();
    if (Array.isArray(saved) && saved.some((c) => c.body === msg)) {
      ok("真的落库了（不是只在前端 state 里）");
    } else {
      bad(`库里查不到这条留言：${JSON.stringify(saved).slice(0, 160)}`);
    }

    // 刷新后仍在 —— 证明服务端渲染那条路也通
    await page.reload();
    await page.waitForSelector(".v2-comments", { timeout: 20000 });
    const after = await page.locator(".v2-cmt:not(.sys) .body").allInnerTexts();
    if (after.includes(msg)) ok("刷新后还在（服务端渲染路径也通）");
    else bad("刷新后留言消失了");
  }

  // ---------- B：3 人共享 ----------
  console.log("\n[B] 3 人共享");
  {
    // co_owner 能不能发邀请：直接打 PostgREST 验 RLS（这是被放宽的那一条）
    if (!friend) {
      console.log("  – 跳过 co_owner 邀请验证（未配 E2E_TEST_EMAIL_2）");
    } else {
      // 把 friend 加成 co_owner
      await fetch(`${SUPA}/rest/v1/list_members`, {
        method: "POST",
        headers: me.H,
        body: JSON.stringify({
          list_id: list.id,
          user_id: friend.userId,
          role: "co_owner",
        }),
      });
      const r = await fetch(`${SUPA}/rest/v1/list_invites`, {
        method: "POST",
        headers: { ...friend.H, Prefer: "return=representation" },
        body: JSON.stringify({
          list_id: list.id,
          created_by: friend.userId,
          role: "co_owner",
        }),
      });
      if (r.ok) ok("co_owner 能发邀请了（RLS 放行，sql/0024）");
      else bad(`co_owner 发邀请仍被拒：${r.status} ${(await r.text()).slice(0, 120)}`);

      // co_owner 能不能看到成员名单
      const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 1200 } });
      const p2 = await ctx2.newPage();
      await p2.goto(`${BASE}/login`);
      await p2.locator("input[type=email]").first().fill(env.E2E_TEST_EMAIL_2);
      await p2.locator("input[type=password]").first().fill(env.E2E_TEST_PASSWORD_2);
      await p2.getByRole("button", { name: /^登录$/ }).first().click();
      await p2.waitForURL(/\/lists/, { timeout: 30000 });
      await p2.goto(`${BASE}/lists/${list.id}`);
      await p2.waitForTimeout(1500);
      const t2 = await p2.locator("body").innerText();
      if (/成员\s*·\s*\d/.test(t2)) ok("co_owner 也能看到成员名单了");
      else bad("co_owner 仍看不到成员名单");
      // 但管理动作仍限 owner
      if ((await p2.getByRole("button", { name: "移除" }).count()) === 0) {
        ok("co_owner 看不到「移除」按钮（管理仍限 owner）");
      } else {
        bad("co_owner 出现了「移除」按钮 —— 管理权限漏了");
      }
      await ctx2.close();
    }
  }

  // ---------- D：心跳 ----------
  console.log("\n[D] 活跃心跳");
  {
    const prof = await (
      await fetch(
        `${SUPA}/rest/v1/profiles?id=eq.${me.userId}&select=last_seen_at`,
        { headers: me.H },
      )
    ).json();
    const ts = prof?.[0]?.last_seen_at;
    if (ts && Date.now() - Date.parse(ts) < 10 * 60 * 1000) {
      ok(`浏览期间打过卡：last_seen_at = ${ts}`);
    } else {
      bad(`last_seen_at 没有被更新：${ts ?? "null"}`);
    }
  }
} finally {
  await browser.close();
  await cleanup();
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
