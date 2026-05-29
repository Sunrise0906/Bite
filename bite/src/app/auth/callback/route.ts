import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));

  const supabase = await createClient();

  // PKCE flow（OAuth + Magic Link，新版 Supabase 默认）
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const back = new URL(
        `/login?error=${encodeURIComponent(error.message)}`,
        url.origin,
      );
      return NextResponse.redirect(back);
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // OTP flow（旧版 / 邮箱验证链接）
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      const back = new URL(
        `/login?error=${encodeURIComponent(error.message)}`,
        url.origin,
      );
      return NextResponse.redirect(back);
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // 既没有 code 也没有 token_hash，参数无效
  return NextResponse.redirect(
    new URL("/login?error=invalid_callback", url.origin),
  );
}
