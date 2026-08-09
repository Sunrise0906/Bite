// 验证 sql/0017 的邀请越权修复真的生效（直打 PostgREST，绕过应用层——
// 攻击者也是这么打的，所以这才是有意义的验证面）。
//
// 检查四条：
//   1. accept_list_invite() 函数存在且可调用（用随机 token → 应返回 not_found）
//   2. list_invites 的 select 不再是 any-auth（拿不到别人清单的邀请）
//   3. list_invites 的 update 不再允许任意用户改任意未使用的邀请
//   4. list_members 不再允许未绑定 token 的自助插入
//
// 用法：node scripts/verify/invite-rls.mjs
// 只读 + 一次注定失败的写尝试；不会留下任何数据。

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPA || !ANON) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY");
  process.exit(1);
}

const auth = await (
  await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.E2E_TEST_EMAIL,
      password: env.E2E_TEST_PASSWORD,
    }),
  })
).json();

const JWT = auth.access_token;
if (!JWT) {
  console.error("登录失败，检查 .env.local 的 E2E_TEST_EMAIL / E2E_TEST_PASSWORD");
  process.exit(1);
}
const H = { apikey: ANON, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" };

let pass = 0;
let fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };

// ---- 1. accept_list_invite() 存在 ------------------------------------------
console.log("\n[1] accept_list_invite() 函数");
{
  const res = await fetch(`${SUPA}/rest/v1/rpc/accept_list_invite`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ p_token: randomUUID() }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 404) {
    bad("函数不存在 —— sql/0017 没跑成功？");
  } else if (!res.ok) {
    bad(`调用失败 ${res.status}: ${JSON.stringify(body).slice(0, 160)}`);
  } else {
    const row = Array.isArray(body) ? body[0] : body;
    if (row && row.ok === false && row.error_code === "not_found") {
      ok("存在，随机 token 正确返回 not_found");
    } else {
      bad(`返回不符合预期：${JSON.stringify(row)}`);
    }
  }
}

// ---- 2. select 不再 any-auth -----------------------------------------------
console.log("\n[2] list_invites SELECT 收紧");
{
  const res = await fetch(`${SUPA}/rest/v1/list_invites?select=token,list_id,role`, { headers: H });
  const rows = await res.json().catch(() => []);
  if (!res.ok) {
    bad(`查询报错 ${res.status}: ${JSON.stringify(rows).slice(0, 160)}`);
  } else if (!Array.isArray(rows)) {
    bad(`返回不是数组：${JSON.stringify(rows).slice(0, 160)}`);
  } else {
    // 收紧后只能看到自己发的 / 自己拥有的清单的邀请。
    // 无法从这里断言「全库有多少条」，但可以断言：返回的每条都属于我能读的清单。
    const listIds = [...new Set(rows.map((r) => r.list_id))];
    let foreign = 0;
    for (const id of listIds) {
      const r2 = await fetch(`${SUPA}/rest/v1/lists?id=eq.${id}&select=id,owner_id`, { headers: H });
      const l = await r2.json().catch(() => []);
      if (!Array.isArray(l) || l.length === 0) foreign++;
    }
    if (foreign > 0) {
      bad(`看到了 ${foreign} 个「读不到对应清单」的邀请 —— select 策略仍然过宽`);
    } else {
      ok(`只看到 ${rows.length} 条邀请，且都属于我能读的清单`);
    }
  }
}

// ---- 3. update 不再允许任意用户改任意未使用邀请 -----------------------------
console.log("\n[3] list_invites UPDATE 收紧");
{
  // 尝试把「所有未使用的邀请」role 改成 co_owner。收紧后应影响 0 行。
  const res = await fetch(
    `${SUPA}/rest/v1/list_invites?used_at=is.null&select=token`,
    {
      method: "PATCH",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ role: "co_owner" }),
    },
  );
  const rows = await res.json().catch(() => []);
  if (res.ok && Array.isArray(rows) && rows.length === 0) {
    ok("批量改 role 影响 0 行");
  } else if (!res.ok) {
    ok(`被拒（${res.status}）`);
  } else {
    bad(`改动了 ${rows.length} 行 —— update 策略仍然过宽！`);
  }
}

// ---- 4. list_members 自助插入已关闭 ----------------------------------------
console.log("\n[4] list_members 自助插入已关闭");
{
  // 找一个我不是成员、也不是 owner 的清单是不现实的（我读不到）。
  // 改为验证策略本身：往一个随机 list_id 插自己，应被 RLS 拒（而不是成功）。
  const res = await fetch(`${SUPA}/rest/v1/list_members`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      list_id: randomUUID(),
      user_id: auth.user?.id,
      role: "co_owner",
    }),
  });
  const body = await res.json().catch(() => null);
  if (res.ok) {
    bad(`插入成功了 —— 自助入伙没关掉！${JSON.stringify(body).slice(0, 160)}`);
  } else {
    ok(`被拒（${res.status} ${body?.code ?? ""}）`);
  }
}

// ---- 5. 完整邀请流程（两账号真跑一遍，自清理）-------------------------------
// 只有这一条能抓到 sql/0017 里那个 42702 命名冲突 —— 前四条全绿它照样是坏的。
console.log("\n[5] 完整邀请流程（A 发 → B 接受）");
if (!env.E2E_TEST_EMAIL_2 || !env.E2E_TEST_PASSWORD_2) {
  console.log("  – 跳过（未配置 E2E_TEST_EMAIL_2 / E2E_TEST_PASSWORD_2）");
} else {
  const auth2 = await (
    await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: env.E2E_TEST_EMAIL_2,
        password: env.E2E_TEST_PASSWORD_2,
      }),
    })
  ).json();
  const H2 = { apikey: ANON, Authorization: `Bearer ${auth2.access_token}`, "Content-Type": "application/json" };
  const AID = auth.user.id;
  const BID = auth2.user.id;

  const mine = await (await fetch(`${SUPA}/rest/v1/lists?owner_id=eq.${AID}&select=id&limit=1`, { headers: H })).json();
  if (!Array.isArray(mine) || mine.length === 0) {
    console.log("  – 跳过（账号 A 没有自己拥有的清单）");
  } else {
    const lid = mine[0].id;
    const already = await (await fetch(`${SUPA}/rest/v1/list_members?list_id=eq.${lid}&user_id=eq.${BID}&select=user_id`, { headers: H })).json();
    if (Array.isArray(already) && already.length > 0) {
      console.log("  – 跳过（B 已是该清单成员，不动既有数据）");
    } else {
      const inv = await (await fetch(`${SUPA}/rest/v1/list_invites`, {
        method: "POST", headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({ list_id: lid, created_by: AID, role: "viewer" }),
      })).json();
      const token = inv[0]?.token;

      const acc = await (await fetch(`${SUPA}/rest/v1/rpc/accept_list_invite`, {
        method: "POST", headers: H2, body: JSON.stringify({ p_token: token }),
      })).json();
      const row = Array.isArray(acc) ? acc[0] : acc;

      if (row?.ok === true) ok("B 接受成功");
      else bad(`B 接受失败：${JSON.stringify(row).slice(0, 200)}`);

      const mem = await (await fetch(`${SUPA}/rest/v1/list_members?list_id=eq.${lid}&user_id=eq.${BID}&select=role`, { headers: H })).json();
      const role = mem[0]?.role;
      if (role === "viewer") ok("角色 = viewer（邀请里写的，不是自封 co_owner）");
      else bad(`角色 = ${role}（应为 viewer）`);

      const again = await (await fetch(`${SUPA}/rest/v1/rpc/accept_list_invite`, {
        method: "POST", headers: H2, body: JSON.stringify({ p_token: token }),
      })).json();
      const r2 = Array.isArray(again) ? again[0] : again;
      if (r2?.error_code === "already_used") ok("同一 token 二次使用被拒");
      else bad(`二次使用应返回 already_used，实际 ${JSON.stringify(r2).slice(0, 120)}`);

      // 清理
      await fetch(`${SUPA}/rest/v1/list_members?list_id=eq.${lid}&user_id=eq.${BID}`, { method: "DELETE", headers: H });
      await fetch(`${SUPA}/rest/v1/list_invites?token=eq.${token}`, { method: "DELETE", headers: H });
      const left = await (await fetch(`${SUPA}/rest/v1/list_members?list_id=eq.${lid}&user_id=eq.${BID}&select=user_id`, { headers: H })).json();
      if (Array.isArray(left) && left.length === 0) ok("已清理，恢复原状");
      else bad("清理失败，留下了成员行");
    }
  }
}

console.log(`\n${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
