"use server";

import { createClient } from "@/lib/supabase/server";

// 廉价版「谁在线」：客户端每 30 秒打一次卡，成员名单显示「N 分钟内活跃」。
// 没上 Realtime Presence —— 见 sql/0026 的说明。

export async function heartbeat(): Promise<void> {
  // ⚠️ 这里**不能**用 requireUser()：它在拿不到 session 时会 redirect("/login")。
  // 心跳是每 30 秒无差别跑的后台定时器，session 一过期就会把用户从正在填的
  // 加店表单上一脚踢走 —— 一个纯装饰性的功能不该有这种权力。
  // 没登录就安静地什么都不做。
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;

  // best-effort：失败（比如 0026 还没跑）就当没这个功能，绝不打扰用户
  await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.user.id);
}
