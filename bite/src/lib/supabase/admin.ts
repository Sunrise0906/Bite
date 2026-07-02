// service-role 管理客户端 —— 绕过 RLS，仅限服务端明确需要跨用户读写的场景
// （目前唯一用途：Web Push 读取接收者的订阅，lib/push/send.ts）。
// 未配 SUPABASE_SERVICE_ROLE_KEY 时返回 null，调用方必须优雅降级。
// ⚠️ 绝不能在任何会流向客户端的代码里 import。

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
