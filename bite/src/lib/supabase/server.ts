import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { AsyncLocalStorage } from "node:async_hooks";

// 注意：这个 client 是**无类型**的（没传 Database 泛型），所以所有 .from(...) 调用
// 都不做列名/类型校验。原先有一份手写的 src/lib/supabase/types.ts，但它从未被传进来，
// 只是让人误以为有类型安全，且已比 schema 落后 8 张表，故删除。
// 真要类型安全应该用 `supabase gen types typescript` 生成再传泛型（会一次性影响 26 处消费方）。
function cookieClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component 中 cookies() 为只读，写入会抛错。
            // Token 刷新会在下次请求时由 proxy.ts 处理。
          }
        },
      },
    },
  );
}

/** 服务端 Supabase client 的类型。cookie 版和 Bearer 版在运行时是同一个类。 */
export type ServerSupabaseClient = ReturnType<typeof cookieClient>;

// ---------------------------------------------------------------------------
// 请求作用域（给 iOS App 用）
//
// 网页走 cookie；iOS App 走 `Authorization: Bearer <supabase access_token>`。
// mobile route handler 先用 token 换出 user + 带该 token 的 client
// （lib/supabase/mobile-auth.ts），再塞进 AsyncLocalStorage。之后**同一条请求里**
// 任何 createClient() / getUser() / requireUser() 拿到的都是这一份 ——
// 于是 server action 里的业务函数、LLM router、每日配额、推送通知……
// 一行不改就能给 App 复用，RLS 也照常以该用户身份生效。
//
// 没有作用域（普通网页请求）时行为完全不变：读 cookie。
// ---------------------------------------------------------------------------
export type RequestScope = { supabase: ServerSupabaseClient; user: User };

const requestScope = new AsyncLocalStorage<RequestScope>();

export function runWithRequestScope<T>(
  scope: RequestScope,
  fn: () => Promise<T>,
): Promise<T> {
  return requestScope.run(scope, fn);
}

export async function createClient(): Promise<ServerSupabaseClient> {
  const scoped = requestScope.getStore();
  if (scoped) return scoped.supabase;
  const cookieStore = await cookies();
  return cookieClient(cookieStore);
}

export async function getUser(): Promise<User | null> {
  const scoped = requestScope.getStore();
  if (scoped) return scoped.user;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
