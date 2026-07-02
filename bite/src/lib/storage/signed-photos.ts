// photos bucket 私有化后的 signed URL 工具。
//
// 约定：DB 里的 photo_urls / visit_logs.photos 永远存「canonical URL」——
//   - 外链（XHS CDN、用户贴的图床）原样存；
//   - 自家 Storage 的图存 getPublicUrl 格式（.../storage/v1/object/public/photos/<path>）。
//     bucket 变私有后这个 URL 直接访问会 400，但它是稳定标识符，展示层在
//     server 渲染时把它换成短期 signed URL（本模块），编辑层（表单 textarea /
//     hidden input）继续读写 canonical——绝不把会过期的 signed URL 写回 DB。
//
// 签名失败（网络 / 策略 / path 不存在）一律回退原 URL：bucket 还是 public 时
// 页面照常工作，所以「先上代码 → 再跑 sql/0013 翻私有」的顺序是安全的。

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDecodeURIComponent } from "@/lib/url/safe-decode";

const PUBLIC_MARKER = "/storage/v1/object/public/photos/";
const SIGN_MARKER = "/storage/v1/object/sign/photos/";

/** signed URL 有效期：7 天。页面按请求动态渲染，不会拿到临期链接 */
export const PHOTO_URL_TTL_SEC = 60 * 60 * 24 * 7;

/**
 * 写库前的归一化：把自家 signed URL（.../object/sign/photos/<path>?token=...）
 * 改写回 canonical。不做这一步的话，用户从页面「复制图片地址」贴回表单，
 * 落库的就是 7 天后过期的 signed URL——图会永久失效。外链和 canonical 原样返回。
 */
export function normalizePhotoUrl(
  url: string,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  if (!supabaseUrl || !url.startsWith(supabaseUrl)) return url;
  const idx = url.indexOf(SIGN_MARKER);
  if (idx === -1) return url;
  const raw = url.slice(idx + SIGN_MARKER.length).split(/[?#]/)[0];
  if (!raw) return url;
  return `${supabaseUrl}${PUBLIC_MARKER}${raw}`;
}

/**
 * 从 canonical URL 抽出 photos bucket 内的对象 path。
 * 不是自家 Storage 的 URL（外链）返回 null。
 */
export function extractPhotosPath(
  url: string,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!supabaseUrl || !url.startsWith(supabaseUrl)) return null;
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx === -1) return null;
  const raw = url.slice(idx + PUBLIC_MARKER.length).split(/[?#]/)[0];
  if (!raw) return null;
  // getPublicUrl 会对 path 做 URL 编码；createSignedUrls 要原始 path
  return safeDecodeURIComponent(raw);
}

/**
 * 批量签名：groups 是「每个对象一组 URL」（比如每家店的 photo_urls），
 * 展平后对所有自家 Storage URL 用一次 createSignedUrls 调用签完，
 * 外链原样保留。任何失败都回退原 URL，绝不 throw。
 */
export async function signNestedPhotoUrls(
  supabase: SupabaseClient,
  groups: string[][],
  expiresInSec: number = PHOTO_URL_TTL_SEC,
): Promise<string[][]> {
  // path → canonical URL 集合（同一张图可能出现在多组，去重签一次）
  const pathByUrl = new Map<string, string>();
  for (const group of groups) {
    for (const url of group) {
      if (pathByUrl.has(url)) continue;
      const path = extractPhotosPath(url);
      if (path) pathByUrl.set(url, path);
    }
  }
  if (pathByUrl.size === 0) return groups;

  const urls = [...pathByUrl.keys()];
  const paths = urls.map((u) => pathByUrl.get(u)!);

  let signedByUrl: Map<string, string>;
  try {
    const { data, error } = await supabase.storage
      .from("photos")
      .createSignedUrls(paths, expiresInSec);
    if (error || !data) return groups;
    signedByUrl = new Map();
    // createSignedUrls 返回顺序与入参 paths 一致；单条失败项 signedUrl 为 null
    data.forEach((item, i) => {
      if (item?.signedUrl) signedByUrl.set(urls[i], item.signedUrl);
    });
  } catch {
    return groups;
  }

  return groups.map((group) =>
    group.map((url) => signedByUrl.get(url) ?? url),
  );
}

/** 单组便捷封装 */
export async function signPhotoUrls(
  supabase: SupabaseClient,
  urls: string[],
  expiresInSec: number = PHOTO_URL_TTL_SEC,
): Promise<string[]> {
  const [signed] = await signNestedPhotoUrls(supabase, [urls], expiresInSec);
  return signed;
}

/**
 * 表单预览用：canonical → signed 的映射（只含自家 Storage 的 URL）。
 * 编辑表单里 textarea / hidden input 存 canonical，img 预览查这张表。
 */
export async function buildPhotoDisplayMap(
  supabase: SupabaseClient,
  urls: string[],
  expiresInSec: number = PHOTO_URL_TTL_SEC,
): Promise<Record<string, string>> {
  const unique = [...new Set(urls)];
  const signed = await signPhotoUrls(supabase, unique, expiresInSec);
  const map: Record<string, string> = {};
  unique.forEach((u, i) => {
    if (signed[i] !== u) map[u] = signed[i];
  });
  return map;
}
