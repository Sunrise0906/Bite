// 验证 sql/0028：快捷评价档位（夯 / 顶级 / 人上人 / NPC / 拉完了）。
//
// 这个功能的两条核心主张都在 RLS 上，而 RLS 是本仓库历史上出洞最多的地方
// （0010 / 0017 / 0027 全是补 RLS）：
//   1. **viewer 也能评** —— 策略口径必须是 can_read_list，不是 can_write_list。
//      「不能改清单内容」和「不能开口」是两回事（同 place_comments / pick_votes）。
//   2. **只能动自己那条** —— 不能冒名、不能改别人的、不能删别人的。
// 外加完整性约束：越界档位被 CHECK 拦下、list_id 张冠李戴被复合外键拦下
// （后者是 0027 的教训：不校验「place 真属于这个 list」= 一条跨清单注入）。
//
// 直打 PostgREST（绕过应用层）—— 攻击者也是这么打的，这才是有意义的验证面。
// 用法：node scripts/verify/tier-rating.mjs
//
// 需要两个测试账号（E2E_TEST_EMAIL(_2) / E2E_TEST_PASSWORD(_2)）。自清理。

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

// A 建一个临时清单 + 一家店，把 B 加成 **viewer**（只读成员，本脚本的重点）
const made = await req(A.jwt, "POST", "lists",
  { name: "[验证] 快捷评价", owner_id: A.uid, category: "food" }, "return=representation");
const listId = made.body?.[0]?.id;
if (!listId) { console.log("建清单失败：", JSON.stringify(made.body).slice(0, 200)); process.exit(1); }

try {
  await req(A.jwt, "POST", "list_members", { list_id: listId, user_id: B.uid, role: "viewer" });
  const placeRes = await req(A.jwt, "POST", "places",
    { list_id: listId, name: "[验证] 店", address: "测试地址", cuisine: ["测试"], created_by: A.uid },
    "return=representation");
  const placeId = placeRes.body?.[0]?.id;
  if (!placeId) { console.log("建店失败：", JSON.stringify(placeRes.body).slice(0, 200)); }
  else {
    const rate = (who, uid, tier) =>
      req(who, "POST", "place_ratings",
        { place_id: placeId, list_id: listId, user_id: uid, tier }, "return=representation");

    console.log("\n【写入权限】");
    {
      const r = await rate(A.jwt, A.uid, 1); // 夯
      if (r.status === 201) ok("owner 能评（tier=1 夯）");
      else bad(`owner 评不了：${r.status} ${JSON.stringify(r.body)}`);
    }
    {
      // ★ 本脚本存在的主要理由
      const r = await rate(B.jwt, B.uid, 5); // 拉完了
      if (r.status === 201) ok("★ viewer 也能评（口径是 can_read_list，不是 can_write_list）");
      else bad(`viewer 被拒 —— 策略是不是写成 can_write_list 了？${r.status} ${JSON.stringify(r.body)}`);
    }

    console.log("\n【越权】");
    {
      const r = await rate(B.jwt, A.uid, 3); // B 冒充 A
      if (r.status === 201) bad("居然能替别人打分（user_id 冒名）");
      else ok(`不能替别人打分（${r.status}）`);
    }
    {
      const r = await req(B.jwt, "PATCH",
        `place_ratings?place_id=eq.${placeId}&user_id=eq.${A.uid}`, { tier: 4 }, "return=representation");
      if ((r.body?.length ?? 0) === 0) ok("改不动别人的评价（影响 0 行）");
      else bad("居然改掉了别人的评价");
    }
    {
      const r = await req(B.jwt, "DELETE",
        `place_ratings?place_id=eq.${placeId}&user_id=eq.${A.uid}`, undefined, "return=representation");
      if ((r.body?.length ?? 0) === 0) ok("删不掉别人的评价（影响 0 行）");
      else bad("居然删掉了别人的评价");
    }

    console.log("\n【可见性】");
    {
      const r = await req(B.jwt, "GET", `place_ratings?place_id=eq.${placeId}&select=user_id,tier`);
      if ((r.body?.length ?? 0) === 2) ok("同清单的人互相看得见（2 条）—— 共享清单里「我夯她拉完了」才有意义");
      else bad(`viewer 应该看到 2 条，实际 ${r.body?.length ?? 0} 条`);
    }

    console.log("\n【完整性约束】");
    {
      const r = await req(A.jwt, "PATCH",
        `place_ratings?place_id=eq.${placeId}&user_id=eq.${A.uid}`, { tier: 6 });
      if (r.status === 400 || r.status === 409) ok(`越界档位 tier=6 被 CHECK 拦下（${r.status}）`);
      else bad(`tier=6 居然写进去了：${r.status}`);
    }
    {
      // 0027 的教训：list_id 与 place 不匹配 = 跨清单注入
      const fake = "00000000-0000-0000-0000-000000000001";
      const r = await req(A.jwt, "PATCH",
        `place_ratings?place_id=eq.${placeId}&user_id=eq.${A.uid}`, { list_id: fake });
      if (r.status === 400 || r.status === 409) ok(`list_id 张冠李戴被复合外键拦下（${r.status}）`);
      else bad(`跨清单注入没被拦：${r.status}`);
    }
    {
      const r = await rate(A.jwt, A.uid, 2);
      if (r.status === 409) ok("同人同店只能一条（409）");
      else bad(`重复插入没被拦：${r.status}`);
    }

    console.log("\n【级联】");
    {
      await req(A.jwt, "DELETE", `places?id=eq.${placeId}`);
      const r = await req(A.jwt, "GET", `place_ratings?place_id=eq.${placeId}&select=user_id`);
      if ((r.body?.length ?? 0) === 0) ok("删店会一并带走评价（on delete cascade）");
      else bad("删店后评价还在（孤儿行）");
    }
  }
} finally {
  await req(A.jwt, "DELETE", `lists?id=eq.${listId}`);
}

console.log(`\n${fail === 0 ? "全部通过" : "有失败"}：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
