"use server";

import { createClient, requireUser } from "@/lib/supabase/server";

// Web Push 订阅管理（sql/0015）。RLS 保证只能写自己的行。

export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { error: "订阅数据不完整" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      user_id: user.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return {
      error: `保存订阅失败（数据库还没跑 sql/0015？）：${error.message}`,
    };
  }
  return { ok: true };
}

export async function removePushSubscription(
  endpoint: string,
): Promise<{ ok: true } | { error: string }> {
  await requireUser();
  if (!endpoint) return { error: "缺少 endpoint" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) return { error: `取消订阅失败：${error.message}` };
  return { ok: true };
}
