// 手写建店的核心（**不是** server action 文件）。
// 网页的 createPlace action 和 iOS 的 POST /api/mobile/places 共用：
// 校验 → 同清单归一化查重（拦下而不合并）→ 插入 → 通知共享清单的其他成员。

import { findSameNamed } from "@/lib/db/place-names";
import { notifyListMembersNewPlace } from "@/lib/push/notify-list";
import type { PlacePrice, PlaceStatus } from "@/lib/db/types";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

export type CreatePlaceInput = {
  listId: string;
  name: string;
  address: string;
  cuisine: string[];
  priceRange: PlacePrice | null;
  status: PlaceStatus;
  occasions: string[];
  tags: string[];
  recommendedBy: string | null;
  /** 当前用户自己的想去理由 */
  reason: string | null;
  notes: string | null;
  /** 已经归一化成 canonical 的 URL（signed URL 要先转回来，见 lib/storage/signed-photos） */
  photoUrls: string[];
};

export type CreatePlaceResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createPlaceCore(
  supabase: ServerSupabaseClient,
  userId: string,
  input: CreatePlaceInput,
): Promise<CreatePlaceResult> {
  const name = input.name.trim();
  const address = input.address.trim();
  if (!input.listId) return { ok: false, error: "缺少 list id" };
  if (!name) return { ok: false, error: "请填写店名" };
  if (!address) return { ok: false, error: "请填写地址" };
  if (input.cuisine.length === 0) {
    return {
      ok: false,
      error: "请填写至少一个类型标签（吃=菜系 / 喝=品类 / 玩=类型）",
    };
  }

  // 手写建店以前是裸 INSERT，一次查重都不做 —— 去重只覆盖了「智能添加」那一半入口，
  // 所以反过来的顺序（先从小红书抓过、后手写补一家）100% 产生重复记录且毫无提示。
  // 这里只**拦下并告诉用户**，不静默合并：表单提交却改了另一条已有记录会更吓人。
  const dup = (await findSameNamed(supabase, [input.listId], name))[0];
  if (dup) {
    return {
      ok: false,
      error: `这个清单里已经有「${dup.name}」了。想补充信息就去那家店里编辑，不用再建一条。`,
    };
  }

  const reasonText = input.reason?.trim() ?? "";
  const reasons = reasonText ? [{ user_id: userId, text: reasonText }] : [];

  const { data, error } = await supabase
    .from("places")
    .insert({
      list_id: input.listId,
      name,
      address,
      cuisine: input.cuisine,
      price_range: input.priceRange,
      status: input.status,
      occasions: input.occasions,
      recommended_by: input.recommendedBy,
      tags: input.tags,
      reasons,
      notes: input.notes,
      photo_urls: input.photoUrls,
      source: "manual",
      created_by: userId,
    })
    .select("id")
    // RLS 挡掉时只影响 0 行、不报错（见 CLAUDE.md）—— 回读行数
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false, error: `保存失败：${error.message}` };
  if (!data) return { ok: false, error: "保存失败：你没有这个清单的编辑权限" };

  // 共享清单里加了店，别人应该知道。四条加店路径（智能添加 / 手写 / AI 聊天 / 接受推荐）
  // 口径一致，都会通知。
  await notifyListMembersNewPlace(supabase, userId, input.listId, `「${name}」`);

  return { ok: true, id: data.id };
}
