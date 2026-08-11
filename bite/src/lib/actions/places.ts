"use server";

import { revalidatePath } from "next/cache";
import { findSameNamed, fetchPlaceNameRows } from "@/lib/db/place-names";
import { sameName } from "@/lib/places/name-key";
import { notifyListMembersNewPlace } from "@/lib/push/notify-list";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { normalizePhotoUrl } from "@/lib/storage/signed-photos";
import type { PlaceStatus } from "@/lib/db/types";
import {
  parseTags,
  parseStatus,
  parsePrice,
  VALID_STATUS,
} from "@/lib/places/parse-form";

export type PlaceFormState = {
  error: string | null;
};


// ---- 新建 place ---------------------------------------------------------
export async function createPlace(
  _prev: PlaceFormState,
  formData: FormData,
): Promise<PlaceFormState> {
  const user = await requireUser();
  const listId = String(formData.get("list_id") ?? "");
  if (!listId) return { error: "缺少 list id" };

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const cuisine = parseTags(formData.get("cuisine"));

  if (!name) return { error: "请填写店名" };
  if (!address) return { error: "请填写地址" };
  if (cuisine.length === 0) return { error: "请填写至少一个类型标签（吃=菜系 / 喝=品类 / 玩=类型）" };

  const status = parseStatus(formData.get("status"));
  const priceRange = parsePrice(formData.get("price_range"));
  const occasions = parseTags(formData.get("occasions"));
  const tags = parseTags(formData.get("tags"));
  const recommendedBy =
    String(formData.get("recommended_by") ?? "").trim() || null;
  const reasonText = String(formData.get("reason") ?? "").trim();

  const reasons = reasonText
    ? [{ user_id: user.id, text: reasonText }]
    : [];
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const photoUrls = String(formData.get("photo_urls_text") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    // 用户从页面复制到的自家图是 7 天 signed URL，落库前转回 canonical
    .map((s) => normalizePhotoUrl(s));

  const supabase = await createClient();

  // 手写建店以前是裸 INSERT，一次查重都不做 —— 去重只覆盖了「智能添加」那一半入口，
  // 所以反过来的顺序（先从小红书抓过、后手写补一家）100% 产生重复记录且毫无提示。
  // 这里只**拦下并告诉用户**，不静默合并：表单提交却改了另一条已有记录会更吓人。
  const dup = (await findSameNamed(supabase, [listId], name))[0];
  if (dup) {
    return {
      error: `这个清单里已经有「${dup.name}」了。想补充信息就去那家店里编辑，不用再建一条。`,
    };
  }

  const { error } = await supabase
    .from("places")
    .insert({
      list_id: listId,
      name,
      address,
      cuisine,
      price_range: priceRange,
      status,
      occasions,
      recommended_by: recommendedBy,
      tags,
      reasons,
      notes,
      photo_urls: photoUrls,
      source: "manual",
      created_by: user.id,
    });

  if (error) return { error: `保存失败：${error.message}` };

  // 共享清单里加了店，别人应该知道。以前只有「智能添加」那两条路径会通知，
  // 手写表单静悄悄 —— 同一个用户行为，两条代码路径行为不一致。
  await notifyListMembersNewPlace(supabase, user.id, listId, `「${name}」`);

  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}?toast=place_added`);
}

// ---- 更新 place ---------------------------------------------------------
export async function updatePlace(
  _prev: PlaceFormState,
  formData: FormData,
): Promise<PlaceFormState> {
  const user = await requireUser();
  const placeId = String(formData.get("place_id") ?? "");
  const listId = String(formData.get("list_id") ?? "");
  if (!placeId || !listId) return { error: "缺少必要参数" };

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const cuisine = parseTags(formData.get("cuisine"));

  if (!name) return { error: "请填写店名" };
  if (!address) return { error: "请填写地址" };
  if (cuisine.length === 0) return { error: "请填写至少一个类型标签（吃=菜系 / 喝=品类 / 玩=类型）" };

  const notesRaw = formData.get("notes");
  const photoRaw = formData.get("photo_urls_text");
  const supabase = await createClient();

  // 改名也可能撞上同清单里的另一条（撞上之后两条永远无法自动合并）。
  // ⚠️ 只有**真的改了名**才查重：库里本来就可能有两条归一化后同名的历史行
  // （见 name-key.ts —— 那种行我们刻意不自动合并，交给用户处理）。无条件查重
  // 会让那两条互相锁死：打开任意一条只想改个地址，都会被「已经有…了」顶回来。
  const rows = await fetchPlaceNameRows(supabase, [listId]);
  const self = rows.find((r) => r.id === placeId);
  if (!self || !sameName(self.name, name)) {
    const dup = rows.find((r) => r.id !== placeId && sameName(r.name, name));
    if (dup) {
      return { error: `这个清单里已经有「${dup.name}」了，换个名字。` };
    }
  }

  const { data: updated, error } = await supabase
    .from("places")
    .update({
      name,
      address,
      cuisine,
      price_range: parsePrice(formData.get("price_range")),
      status: parseStatus(formData.get("status")),
      occasions: parseTags(formData.get("occasions")),
      tags: parseTags(formData.get("tags")),
      recommended_by:
        String(formData.get("recommended_by") ?? "").trim() || null,
      // notes / photo_urls 不在表单时不动；空字符串 → 清空
      ...(notesRaw !== null
        ? { notes: String(notesRaw).trim() || null }
        : {}),
      ...(photoRaw !== null
        ? {
            photo_urls: String(photoRaw)
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => normalizePhotoUrl(s)),
          }
        : {}),
    })
    .eq("id", placeId)
    // ⚠️ RLS 挡掉时 Postgres 不报错、只是影响 0 行 —— 必须回读行数，
    // 否则 viewer 保存会看到「已更新」而数据库毫无变化。
    .select("id");

  if (error) return { error: `保存失败：${error.message}` };
  if (!updated || updated.length === 0) {
    return { error: "保存失败：你没有这个清单的编辑权限" };
  }

  // 单独处理 reasons：v1 用户只能改 / 删自己的那一条。
  // 失败不阻断（主字段已保存成功），留痕排查
  const reasonText = String(formData.get("reason") ?? "").trim();
  const reasonSync = await syncOwnReason(placeId, user.id, reasonText);
  if (reasonSync.error) {
    console.error(`updatePlace: 主字段已保存但 reason 同步失败（place=${placeId}）：${reasonSync.error}`);
  }

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/places/${placeId}/edit`);
  redirect(`/lists/${listId}?toast=place_updated`);
}

async function syncOwnReason(
  placeId: string,
  userId: string,
  newText: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error: selErr } = await supabase
    .from("places")
    .select("reasons")
    .eq("id", placeId)
    .single();
  // select 失败时不能拿空数组当现状覆盖回去——会把所有人的 reason 清掉
  if (selErr) return { error: selErr.message };

  const existing: Array<{ user_id: string; text: string }> =
    Array.isArray(data?.reasons) ? data.reasons : [];

  const next = existing.filter((r) => r.user_id !== userId);
  if (newText) next.push({ user_id: userId, text: newText });

  const { data: updRows, error: updErr } = await supabase
    .from("places")
    .update({ reasons: next })
    .eq("id", placeId)
    .select("id"); // RLS 静默 0 行的兜底，见 updatePlace 的注释
  if (updErr) return { error: updErr.message };
  if (!updRows || updRows.length === 0) return { error: "没有编辑权限" };
  return {};
}

// ---- 快速改 place 状态（卡片上一键切换）--------------------------------
export async function updatePlaceStatus(
  placeId: string,
  listId: string,
  next: PlaceStatus,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  if (!VALID_STATUS.includes(next)) return { ok: false, error: "无效状态" };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("places")
    .update({ status: next })
    .eq("id", placeId)
    // ⚠️ 必须回读行数：viewer 点状态 chip 时 RLS 影响 0 行且不报错，
    // 而 status-quick-toggle.tsx 的乐观 UI 靠 `if (!r.ok)` 回滚 —— 不查行数就永远不回滚。
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "你没有这个清单的编辑权限" };
  }

  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

// ---- 删除 place ---------------------------------------------------------
export async function deletePlace(formData: FormData): Promise<void> {
  await requireUser();
  const placeId = String(formData.get("place_id") ?? "");
  const listId = String(formData.get("list_id") ?? "");
  if (!placeId || !listId) redirect("/lists");

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("places")
    .delete()
    .eq("id", placeId)
    .select("id"); // RLS 静默 0 行的兜底，见 updatePlace 的注释

  if (error) {
    redirect(
      `/lists/${listId}?error=${encodeURIComponent(`删除失败：${error.message}`)}`,
    );
  }
  if (!deleted || deleted.length === 0) {
    redirect(
      `/lists/${listId}?error=${encodeURIComponent("删除失败：你没有这个清单的编辑权限")}`,
    );
  }

  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}?toast=place_deleted`);
}
