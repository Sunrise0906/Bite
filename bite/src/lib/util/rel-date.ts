// PlaceCard 上「3 天前 / 1 周前 / 1 月前 / 1 年前」的相对日期。
// 阈值边界手写易错，抽出来加测试。
// 注意 days < 0（future / clock skew）一律按"今天"处理，
// 避免出现"-1 年前"这种 nonsense。

export function relDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return "今天"; // 时钟漂移 / 未来日期：别露出 "-N 年前"
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}
