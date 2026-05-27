import type { VisitSentiment } from "@/lib/db/types";

// 造访信号聚合（每家店去过几次 / 最近一次 / 平均星级）。
// 纯函数，从 /lists/[id] 页和 chat-tools 的 summarizeVisits 抽出来——
// 之前两处各写一份相似 reduce，会漂移；且这是用户可见（PlaceCard）+ AI 决策都读的
// 数据，值得单测兜底。

export type VisitLogRow = {
  place_id: string;
  visited_at: string;
  sentiment: VisitSentiment;
  star_rating?: number | null;
};

export type VisitSignal = {
  count: number;
  last_visit: string;
  last_sentiment: VisitSentiment;
  /** 仅对有星级（非 null）的造访求平均；一条带星的都没有则 null。未做四舍五入，展示层自行处理。 */
  avg_star: number | null;
};

/**
 * 聚合每家店的造访信号。
 *
 * 前置约定：logs 已按 visited_at **降序**（调用方查询 `.order("visited_at", desc)`）。
 * 每家店遇到的第一条即最近一次，用它的 visited_at / sentiment 作为 last_*。
 */
export function aggregateVisitSignals(
  logs: readonly VisitLogRow[],
): Map<string, VisitSignal> {
  const result = new Map<string, VisitSignal>();
  const starSums = new Map<string, { total: number; count: number }>();

  for (const log of logs) {
    const cur = result.get(log.place_id);
    if (!cur) {
      result.set(log.place_id, {
        count: 1,
        last_visit: log.visited_at,
        last_sentiment: log.sentiment,
        avg_star: null,
      });
    } else {
      cur.count += 1;
    }
    // 星级单独累计，最后再算平均（null 不计入）
    if (log.star_rating != null) {
      const s = starSums.get(log.place_id) ?? { total: 0, count: 0 };
      s.total += log.star_rating;
      s.count += 1;
      starSums.set(log.place_id, s);
    }
  }

  for (const [pid, s] of starSums) {
    const v = result.get(pid);
    if (v && s.count > 0) v.avg_star = s.total / s.count;
  }

  return result;
}
