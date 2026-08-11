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
      // ⚠️ 上面那条 RLS 断言只证明「后端允许」。UI 上按不按得到是另一回事 ——
      // 第一版就是 RLS 放宽了、按钮还挡着 isOwner，脚本只打 PostgREST 所以全绿。
      if ((await p2.getByRole("button", { name: /邀请/ }).count()) > 0) {
        ok("co_owner 在页面上真的看得到「邀请」入口");
      } else {
        bad("co_owner 看不到邀请按钮 —— 放宽了 RLS 却没人点得到");
      }
      await ctx2.close();
    }
  }

  // ---------- 对抗式复审查出来的那几条 ----------
  console.log("\n[E] 复审查出的回归 / 漏洞");
  {
    // E1：历史重复行必须仍然可编辑（无条件查重会让两条互相锁死）
    // 直接造两条归一化后同名的行（模拟旧 bug 留下的数据）
    await fetch(`${SUPA}/rest/v1/places`, {
      method: "POST",
      headers: me.H,
      body: JSON.stringify({
        list_id: list.id,
        name: "Mori's",
        address: "旧地址",
        cuisine: ["咖啡"],
        created_by: me.userId,
      }),
    });
    const two = await (
      await fetch(
        `${SUPA}/rest/v1/places?list_id=eq.${list.id}&select=id,name&order=created_at.asc`,
        { headers: me.H },
      )
    ).json();
    if (two.length === 2) {
      ok(`造出历史重复行：${two.map((r) => r.name).join(" / ")}`);
      // 打开其中一条的编辑页，只改地址、不动店名
      await page.goto(`${BASE}/lists/${list.id}/places/${two[0].id}/edit`);
      await page.waitForSelector("input[name=address]", { timeout: 20000 });
      await page.locator("input[name=address]").fill("只改了地址-验证用");
      await page.getByRole("button", { name: /保存|更新/ }).first().click();
      await page.waitForTimeout(2000);
      const after = await (
        await fetch(`${SUPA}/rest/v1/places?id=eq.${two[0].id}&select=address`, {
          headers: me.H,
        })
      ).json();
      if (after?.[0]?.address === "只改了地址-验证用") {
        ok("没改名时不查重 —— 历史重复行仍然编辑得动");
      } else {
        bad(`历史重复行被查重锁死了，地址没保存：${JSON.stringify(after)}`);
      }
      // 但真的改成撞车的名字，仍然要拦。
      // ⚠️ 得先造一家名字完全不同的店 —— two[0] 和 two[1] 归一化后本来就同名，
      //    把 two[0] 改成 two[1] 的名字等于「没改名」，测不出东西（第一版就错在这）。
      const [third] = await (
        await fetch(`${SUPA}/rest/v1/places`, {
          method: "POST",
          headers: { ...me.H, Prefer: "return=representation" },
          body: JSON.stringify({
            list_id: list.id,
            name: "完全不同的一家",
            address: "somewhere",
            cuisine: ["咖啡"],
            created_by: me.userId,
          }),
        })
      ).json();
      await page.goto(`${BASE}/lists/${list.id}/places/${third.id}/edit`);
      await page.waitForSelector("input[name=name]", { timeout: 20000 });
      await page.locator("input[name=name]").fill("MOri’s");
      await page.getByRole("button", { name: /保存|更新/ }).first().click();
      await page.waitForTimeout(1800);
      const t = await page.locator("body").innerText();
      if (/已经有.*了，换个名字/.test(t)) ok("真的改成撞车的名字仍然被拦下");
      else bad("改名撞车没被拦（查重被我关过头了）");
    } else {
      bad(`造历史重复行失败，当前 ${two.length} 行`);
    }

    // E2：评论不能被搬到别的 place / 别的清单（复合外键 + update 策略）
    const cs = await (
      await fetch(`${SUPA}/rest/v1/place_comments?select=id&limit=1`, {
        headers: me.H,
      })
    ).json();
    // ⚠️ 要拿一家**别的清单**里的店来试，才谈得上「搬走」。
    //    第一版拿的是本清单里的店，(place_id, list_id) 本来就一致，外键当然放行。
    const outside = (
      await (
        await fetch(
          `${SUPA}/rest/v1/places?list_id=neq.${list.id}&select=id,list_id&limit=1`,
          { headers: me.H },
        )
      ).json()
    )[0];
    if (cs?.[0] && outside) {
      const bogus = await fetch(
        `${SUPA}/rest/v1/place_comments?id=eq.${cs[0].id}`,
        {
          method: "PATCH",
          headers: me.H,
          body: JSON.stringify({ place_id: outside.id }),
        },
      );
      if (!bogus.ok) {
        ok("评论搬不到别的清单的店上（复合外键生效）");
      } else {
        bad("评论被搬到了别的清单的店上 —— 复合外键没生效");
      }
    } else {
      console.log("  – 跳过跨清单注入验证（没有第二个清单的店可用）");
    }

    // E3：last_seen_at 不再全站可读
    const leak = await fetch(
      `${SUPA}/rest/v1/profiles?select=id,last_seen_at&limit=1`,
      { headers: me.H },
    );
    if (!leak.ok) ok("last_seen_at 已从 profiles 的列级读权限撤掉（0027）");
    else bad(`任意登录用户仍能直接读 last_seen_at：${(await leak.text()).slice(0, 100)}`);
  }

  // ---------- D：心跳 ----------
  console.log("\n[D] 活跃心跳");
  {
    // 只能通过 RPC 读了（0027 撤了列级读权限）—— 顺便验证那个函数确实能用
    const rows = await (
      await fetch(`${SUPA}/rest/v1/rpc/list_member_activity`, {
        method: "POST",
        headers: me.H,
        body: JSON.stringify({ p_list_id: list.id }),
      })
    ).json();
    const ts = Array.isArray(rows)
      ? rows.find((r) => r.user_id === me.userId)?.last_seen_at
      : null;
    if (ts && Date.now() - Date.parse(ts) < 10 * 60 * 1000) {
      ok(`浏览期间打过卡（经 list_member_activity 读回）：${ts}`);
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
