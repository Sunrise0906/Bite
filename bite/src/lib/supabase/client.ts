import { createBrowserClient } from "@supabase/ssr";

// Database 类型见 ./types.ts（手写）。如需类型推导可改为 createBrowserClient<Database>(...)；
// 改动会一次性影响所有客户端消费方，建议单独 PR 评审。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
