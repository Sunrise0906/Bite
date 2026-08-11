// 店名的**去重键**。
//
// 背景（真实事故）：去重一直是 (list_id, name) 逐字节相等，零归一化。
// 库里手写的那家店叫「MOri’s」—— 弯撇号 U+2019，iOS 智能标点自动替换的结果；
// 而小红书正文 / LLM 抽出来的是 ASCII 的「MOri's」，或被模型规整成「Mori's」。
// 三种写法互不相等，于是明明有一整套合并能力（数组并集、理由保护、覆盖提示），
// 却照样新建了一条重复记录，**全程没有任何提示**。
//
// 这里只做「同一个名字的不同打法」这一层，不做模糊匹配：
// 「海底捞」和「海底捞火锅」是两家不同的记录，那是人的判断，不该由归一化替用户决定。

/**
 * 把店名折成用于比较的 key。**只用于匹配，不用于展示** —— 库里存的永远是用户原样输入的名字。
 *
 * 归一化的四件事：
 * 1. NFKC：全角 → 半角、兼容字符合并（「ＭＯｒｉ」→「MOri」）
 * 2. 各种弯引号 → 直引号（U+2019 是最大的坑：iOS 键盘默认就打这个）
 * 3. 折叠内部连续空白 + 去首尾（NFKC 已把 U+3000 全角空格变成普通空格）
 * 4. 小写（LLM 很爱把「MOri's」规整成「Mori's」）
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 两个店名是否指同一条记录（用于去重 / 「已存在」提示）。 */
export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

/**
 * 按归一化 key 建索引。
 *
 * ⚠️ 库里**本来就可能有**两条归一化后相同的行（正是这个 bug 已经造成的重复）。
 * 这里不去合并它们 —— 那是破坏性操作，得用户自己决定删哪条。
 * 只保证一件事：后续的合并稳定地落在**同一条**上（取先出现的那条，
 * 调用方按 created_at 升序传入，于是永远是最早那条）。
 */
export function indexByName<T extends { name: string }>(
  rows: readonly T[],
): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = normalizeName(r.name);
    if (!m.has(k)) m.set(k, r);
  }
  return m;
}
