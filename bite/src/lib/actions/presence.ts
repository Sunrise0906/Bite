"use server";

import { createClient, requireUser } from "@/lib/supabase/server";

// 廉价版「谁在线」：客户端每 30 秒打一次卡，成员名单显示「N 分钟内活跃」。
// 没上 Realtime Presence —— 见 sql/0026 的说明。

export async function heartbeat(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  // best-effort：失败（比如 0026 还没跑）就当没这个功能，绝不打扰用户
  await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", user.id);
}
