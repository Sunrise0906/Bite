// iOS App 的鉴权 + route handler 外壳。
//
// App 用 supabase-swift 直接登录，拿到 access_token 后带在
// `Authorization: Bearer <token>` 里打 /api/mobile/* 和 /api/chat。
// 这里用 token 反查 user，并构造一个「以该用户身份」发请求的 Supabase client
// （PostgREST / Storage / RPC 全部带这个 JWT，RLS 照常生效），然后塞进
// lib/supabase/server.ts 的请求作用域，让现有业务代码原样复用。
//
// 只做「读」的东西 App 直接连 Supabase；只有需要**服务端密钥或副作用**的操作才走这里：
// LLM 抽取 / 小红书抓取 / Google Places（服务端 key）/ 推送通知 / 邮件 / 加密的 LLM 设置。

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseTags } from "@/lib/places/parse-form";
import {
  runWithRequestScope,
  type RequestScope,
  type ServerSupabaseClient,
} from "./server";

export async function authenticateBearer(
  req: Request,
): Promise<RequestScope | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  const token = m[1].trim();
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createSupabaseClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  // getUser(jwt) 会去 Auth 服务校验签名 + 有效期，过期 / 伪造一律 null
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    // 运行时就是同一个 SupabaseClient 类；类型上 ssr 版多带了 cookie 适配的泛型而已
    supabase: supabase as unknown as ServerSupabaseClient,
    user: data.user,
  };
}

type MobileHandler = (ctx: {
  req: Request;
  scope: RequestScope;
}) => Promise<Response>;

/** 包一层：Bearer 鉴权 → 请求作用域 → 统一的 JSON 错误。 */
export function mobileRoute(
  handler: MobileHandler,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const scope = await authenticateBearer(req);
    if (!scope) return jsonError("未登录或登录已过期", 401);
    try {
      return await runWithRequestScope(scope, () => handler({ req, scope }));
    } catch (err) {
      console.error("[mobile] unhandled:", err);
      return jsonError(err instanceof Error ? err.message : "服务器错误", 500);
    }
  };
}

export function jsonOk(data: unknown, status = 200): Response {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400): Response {
  return NextResponse.json({ error: message }, { status });
}

export async function readJsonBody<T extends Record<string, unknown>>(
  req: Request,
): Promise<T> {
  try {
    const v: unknown = await req.json();
    return (v && typeof v === "object" ? v : {}) as T;
  } catch {
    return {} as T;
  }
}

/** 取字符串字段：非字符串 → 空串；trim + 截断。 */
export function str(v: unknown, max = 10000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** 取字符串数组字段：数组 → 过滤空项；字符串 → 按逗号 / 空白拆（同表单口径）。 */
export function strList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "string") return parseTags(v);
  return [];
}

/** 数字字段：有限数才算，其余 null。 */
export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
