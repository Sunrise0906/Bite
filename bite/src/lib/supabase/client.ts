import { createBrowserClient } from "@supabase/ssr";

// TODO: 运行 `npx supabase gen types typescript` 后，在此处加 <Database> generic 获得类型推导。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
