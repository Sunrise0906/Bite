"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error: string | null;
  notice: string | null;
};

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  // 仅允许同站点相对路径，防止 open redirect
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/lists";
}

// ---- Email + 密码 登录 ----------------------------------------------------
export async function signInWithEmail(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "请输入邮箱和密码", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: translateError(error.message), notice: null };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

// ---- Email + 密码 注册 ----------------------------------------------------
export async function signUpWithEmail(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim() || null;
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "请输入邮箱和密码", notice: null };
  }
  if (password.length < 6) {
    return { error: "密码至少 6 位", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: name ? { name } : undefined,
      emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { error: translateError(error.message), notice: null };
  }

  return {
    error: null,
    notice: "注册成功！请查收邮箱点击验证链接完成登录。",
  };
}

// ---- Magic Link ----------------------------------------------------------
export async function sendMagicLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(formData.get("next"));

  if (!email) {
    return { error: "请输入邮箱", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { error: translateError(error.message), notice: null };
  }

  return {
    error: null,
    notice: "登录链接已发送！查收邮箱，点击链接即可登录。",
  };
}

// ---- Google OAuth --------------------------------------------------------
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect(
      `/login?error=${encodeURIComponent(error?.message ?? "Google 登录初始化失败")}`,
    );
  }

  redirect(data.url);
}

// ---- 退出登录 ------------------------------------------------------------
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// ---- 常见错误的中文翻译 --------------------------------------------------
function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "邮箱或密码错误";
  if (m.includes("email not confirmed")) return "邮箱尚未验证，请查收验证邮件";
  if (m.includes("user already registered")) return "该邮箱已注册，请直接登录";
  if (m.includes("password should be at least")) return "密码至少 6 位";
  if (m.includes("rate limit")) return "请求过于频繁，请稍后再试";
  if (m.includes("for security purposes")) return "请求过于频繁，请稍候再试";
  return msg;
}
