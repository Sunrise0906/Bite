"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { scrapeXhsUrl } from "@/lib/places/xhs";
import { extractPlacesFromText } from "@/lib/llm/extract-place";
import { unionStrings } from "@/lib/places/merge";
import { mirrorPhotosToStorage } from "@/lib/storage/mirror-photos";

// 「用这篇小红书更新店铺」：抓帖子 → AI 抽取 → 把新信息合并进已有店铺。
// 合并原则与 quick-add 查重一致：notes 追加不覆盖、菜/标签/图取并集、
// 不动 name/address/status（那些是用户核对过的）。

export type XhsEnrichResult =
  | {
      ok: true;
      added_dishes: number;
      added_photos: number;
      note_appended: boolean;
    }
  | { error: string };

export async function enrichPlaceFromXhsPost(
  placeId: string,
  postUrl: string,
): Promise<XhsEnrichResult> {
  const user = await requireUser();
  if (!placeId || !/xiaohongshu\.com\//.test(postUrl)) {
    return { error: "参数不对" };
  }

  const supabase = await createClient();
  const { data: place, error: readErr } = await supabase
    .from("places")
    .select("id, list_id, name, notes, dishes, tags, photo_urls, source_url")
    .eq("id", placeId)
    .maybeSingle<{
      id: string;
      list_id: string;
      name: string;
      notes: string | null;
      dishes: string[] | null;
      tags: string[] | null;
      photo_urls: string[] | null;
      source_url: string | null;
    }>();
  if (readErr || !place) return { error: "找不到这家店（或没有权限）" };

  // 1. 抓帖子
  let combinedText: string;
  let images: string[];
  try {
    const scraped = await scrapeXhsUrl(postUrl);
    combinedText = scraped.combinedText;
    images = scraped.images;
  } catch (err) {
    return {
      error:
        "帖子抓取失败：" +
        (err instanceof Error ? err.message : "未知错误") +
        "。可以点开原帖复制正文，走首页粘贴流程。",
    };
  }

  // 2. AI 抽取（提示这是关于已知店铺的补充信息）
  const result = await extractPlacesFromText(
    `【背景】以下帖子是关于餐厅「${place.name}」的补充信息，请围绕这家店提取。\n\n${combinedText}`,
  );
  if (!result.ok) return { error: result.error };
  const ex = result.places[0];
  if (!ex) return { error: "帖子里没识别出有效信息" };

  // 3. 合并（图先转存防过期，最多取 6 张）
  const mirrored = await mirrorPhotosToStorage(
    supabase,
    user.id,
    images.slice(0, 6),
  );
  const newDishes = unionStrings(place.dishes, ex.dishes ?? []);
  const newTags = unionStrings(place.tags, ex.tags ?? []);
  const newPhotos = unionStrings(place.photo_urls, mirrored);
  const noteAppend = ex.notes?.trim();
  const newNotes = noteAppend
    ? place.notes?.trim()
      ? `${place.notes.trim()}\n\n【小红书补充】${noteAppend}`
      : `【小红书补充】${noteAppend}`
    : place.notes;

  const { error: upErr } = await supabase
    .from("places")
    .update({
      dishes: newDishes,
      tags: newTags,
      photo_urls: newPhotos,
      notes: newNotes,
      // 没有原帖链接的店，顺手记上这篇
      ...(place.source_url ? {} : { source_url: postUrl }),
    })
    .eq("id", placeId);
  if (upErr) return { error: `保存失败：${upErr.message}` };

  revalidatePath(`/lists/${place.list_id}/places/${placeId}`);
  revalidatePath(`/lists/${place.list_id}`);

  return {
    ok: true,
    added_dishes: newDishes.length - (place.dishes?.length ?? 0),
    added_photos: newPhotos.length - (place.photo_urls?.length ?? 0),
    note_appended: Boolean(noteAppend),
  };
}
