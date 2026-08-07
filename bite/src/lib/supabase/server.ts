import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

// 注意：这个 client 是**无类型**的（没传 Database 泛型），所以所有 .from(...) 调用
// 都不做列名/类型校验。原先有一份手写的 src/lib/supabase/types.ts，但它从未被传进来，
// 只是让人误以为有类型安全，且已比 schema 落后 8 张表，故删除。
// 真要类型安全应该用 `supabase gen types typescript` 生成再传泛型（会一次性影响 26 处消费方）。
export async function createClient() {
  const cookieStore = await cookies();

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

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
