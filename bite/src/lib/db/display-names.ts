import type { createClient } from "@/lib/supabase/server";

// 「user_id → 显示名」的唯一来源。
//
// 这段「查 profiles → name ?? email 用户名前缀 ?? 兜底」以前在 5 个地方各写了一遍，
// 连兜底字符串都不一致（有的「（未知）」有的「朋友」）。评论功能又要用第 6 次，
// 所以先收成一个 helper。
//
// 兜底统一成「朋友」：这些名字出现在「@某某 加的」「@某某 说」这种句子里，
// 「（未知）」读起来像数据坏了，而实际上只是对方还没设昵称。

export type DisplayPerson = {
  name: string;
  avatarUrl: string | null;
};

export const UNKNOWN_PERSON: DisplayPerson = { name: "朋友", avatarUrl: null };

export async function fetchDisplayNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: readonly string[],
): Promise<Map<string, DisplayPerson>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, DisplayPerson>();
  if (ids.length === 0) return out;

  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, avatar_url")
    .in("id", ids);

  for (const p of (data ?? []) as Array<{
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  }>) {
    const fromEmail = p.email?.split("@")[0];
    out.set(p.id, {
      name: p.name?.trim() || fromEmail || UNKNOWN_PERSON.name,
      avatarUrl: p.avatar_url,
    });
  }
  return out;
}

/** 取显示名，查不到就给兜底 —— 调用点不必各自写 ?? 链 */
export function displayNameOf(
  map: ReadonlyMap<string, DisplayPerson>,
  userId: string | null | undefined,
): string {
  if (!userId) return UNKNOWN_PERSON.name;
  return map.get(userId)?.name ?? UNKNOWN_PERSON.name;
}
