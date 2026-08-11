import type { createClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/places/name-key";

// 去重要按**归一化**后的店名比（「MOri’s」==「MOri's」），而归一化没法在 SQL 侧表达，
// 所以只能把候选清单的店名拉回来在内存里配。
//
// ⚠️ 这里必须分页。PostgREST 有 db-max-rows 上限（Supabase 默认 1000），
// 不分页的话清单一旦超过上限，后面那些店的名字就**看不见** —— 表现是
// 「加过的店又被加了一遍」，而且和这次修的原始 bug 一模一样地静默。
// 现在最大的清单才 16 家，但这种上限就是会在没人注意的时候被跨过去。

const PAGE = 1000;

export type PlaceNameRow = { id: string; list_id: string; name: string };

/**
 * 拉这些清单里所有店的 (id, list_id, name)，按 created_at 升序。
 *
 * 升序很重要：库里**本来就可能**有两条归一化后同名的行（正是这个 bug 造成的），
 * indexByName 取先出现的那条，于是合并稳定落在最早那条上。
 */
export async function fetchPlaceNameRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listIds: readonly string[],
): Promise<PlaceNameRow[]> {
  if (listIds.length === 0) return [];
  const out: PlaceNameRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("places")
      .select("id, list_id, name")
      .in("list_id", listIds as string[])
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as PlaceNameRow[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

/** 在这些清单里找和 name 同名（归一化后）的店 */
export async function findSameNamed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listIds: readonly string[],
  name: string,
): Promise<PlaceNameRow[]> {
  const key = normalizeName(name);
  if (!key) return [];
  const rows = await fetchPlaceNameRows(supabase, listIds);
  return rows.filter((r) => normalizeName(r.name) === key);
}
