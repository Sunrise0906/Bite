// 验证 sql/0019：共享清单的 co_owner 能改名，但改不了 owner_id / category，
// 也删不掉清单。
//
// 背景：sql/0001 的 lists_update_owner 是 owner-only，而 places / visit_logs 走的是
// can_write_list（owner 或 co_owner）。结果 co-owner 能加店改店删店，唯独改不了
// 清单名字 —— 与设计文档写的「co-owner 平等读写权限」不一致。
// 0019 把 lists 的 UPDATE 放开到 can_write_list，并用 BEFORE UPDATE 触发器补上
// 列级约束（RLS 只能到行级）：owner_id 永不可改，非 owner 不能改 category。
//
// 直打 PostgREST（绕过应用层）—— 攻击者也是这么打的，这才是有意义的验证面。
// 用法：node scripts/verify/co-owner-rename.mjs

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
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };

async function login(e, p) {
  const r = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env[e], password: env[p] }),
  })).json();
  return { jwt: r.access_token, uid: r.user?.id };
}
const H = (jwt) => ({ apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" });
async function req(jwt, method, path, body, prefer) {
  const h = H(jwt);
  if (prefer) h.Prefer = prefer;
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch { /* 204 无 body */ }
  return { status: r.status, body: j };
}

const A = await login("E2E_TEST_EMAIL", "E2E_TEST_PASSWORD");
const B = await login("E2E_TEST_EMAIL_2", "E2E_TEST_PASSWORD_2");
if (!A.jwt || !B.jwt) { console.log("登录失败（需要两个测试账号）"); process.exit(1); }

// A 建一个临时清单，把 B 加成 co_owner
const made = await req(A.jwt, "POST", "lists",
  { name: "[验证] 共享改名", owner_id: A.uid, category: "food" }, "return=representation");
const listId = made.body?.[0]?.id;
if (!listId) { console.log("建清单失败：", JSON.stringify(made.body).slice(0, 200)); process.exit(1); }
await req(A.jwt, "POST", "list_members", { list_id: listId, user_id: B.uid, role: "co_owner" });
console.log(`临时清单 ${listId.slice(0, 8)}…，B 已是 co_owner\n`);

const nameNow = async () =>
  (await req(A.jwt, "GET", `lists?id=eq.${listId}&select=name,owner_id,category`)).body?.[0];

try {
  console.log("[1] co_owner 能改名");
  {
    const r = await req(B.jwt, "PATCH", `lists?id=eq.${listId}&select=name`,
      { name: "[验证] B 改的名字" }, "return=representation");
    const row = await nameNow();
    if (r.status < 300 && row?.name === "[验证] B 改的名字") ok("改名成功并写库");
    else bad(`改名失败（status=${r.status}，库里=${row?.name}）—— sql/0019 跑了吗？`);
  }

  console.log("\n[2] co_owner 不能把清单过户给自己");
  {
    const r = await req(B.jwt, "PATCH", `lists?id=eq.${listId}`, { owner_id: B.uid });
    const row = await nameNow();
    if (row?.owner_id === A.uid) ok(`owner 仍是 A（status=${r.status}）`);
    else bad("owner_id 被改掉了 —— 触发器没拦住！");
  }

  console.log("\n[3] co_owner 不能改清单领域");
  {
    const r = await req(B.jwt, "PATCH", `lists?id=eq.${listId}`, { category: "activity" });
    const row = await nameNow();
    if (row?.category === "food") ok(`category 仍是 food（status=${r.status}）`);
    else bad("category 被 co_owner 改掉了");
  }

  console.log("\n[4] co_owner 删不掉清单");
  {
    await req(B.jwt, "DELETE", `lists?id=eq.${listId}`);
    const row = await nameNow();
    if (row) ok("清单还在（删除仍只有 owner）");
    else bad("被 co_owner 删掉了！");
  }

  console.log("\n[5] owner 自己什么都能改");
  {
    await req(A.jwt, "PATCH", `lists?id=eq.${listId}`, { category: "activity", name: "[验证] A 改的" });
    const row = await nameNow();
    if (row?.category === "activity" && row?.name === "[验证] A 改的") ok("owner 改名 + 改领域都成功");
    else bad(`owner 改不动：${JSON.stringify(row)}`);
  }
} finally {
  await req(A.jwt, "DELETE", `list_members?list_id=eq.${listId}`);
  await req(A.jwt, "DELETE", `lists?id=eq.${listId}`);
  const left = (await req(A.jwt, "GET", `lists?id=eq.${listId}&select=id`)).body;
  console.log(`\n（清理：${Array.isArray(left) && left.length === 0 ? "已删除临时清单" : "⚠️ 清单可能有残留"}）`);
}

console.log(`${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
