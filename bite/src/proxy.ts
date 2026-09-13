import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 公开路径：登录前可访问
// /api/mobile 与 /api/chat 由 route handler 自己鉴权（iOS 用 Bearer token，没有 cookie），
// 这里放行，否则 App 的请求会被 302 到 /login 拿到一坨 HTML。
// /.well-known 是 Apple 的 universal links 配置文件（apple-app-site-association），必须匿名可读。
const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth", "/api/mobile", "/api/chat", "/.well-known"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 注意：createServerClient 与 getUser 之间不要插入任何逻辑，
  // 否则可能干扰 Supabase 刷新 token。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // 跳过：静态资源、图片优化、各类静态文件、PWA 文件
    // （sw.js / manifest 不跳过的话，未登录请求会被重定向到 /login，
    //  service worker 注册和登录页的 PWA 安装提示都会拿到 HTML 而不是文件）
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
