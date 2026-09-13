import Foundation

/// 每家店的造访信号（去过几次 / 最近一次 / 平均星级），移植自 bite/src/lib/visits/aggregate.ts。
public struct VisitSignal: Hashable, Sendable {
    public var count: Int
    public var lastVisit: String
    public var lastSentiment: VisitSentiment
    /// 仅对有星级的造访求平均；一条带星的都没有则 nil
    public var avgStar: Double?

    public init(count: Int, lastVisit: String, lastSentiment: VisitSentiment, avgStar: Double?) {
        self.count = count; self.lastVisit = lastVisit; self.lastSentiment = lastSentiment; self.avgStar = avgStar
    }
}

public enum VisitAggregate {
    /// 前置约定：logs 已按 visited_at **降序**；每家店遇到的第一条即最近一次。
    public static func signals(_ logs: [VisitLog]) -> [String: VisitSignal] {
        var result: [String: VisitSignal] = [:]
        var starSums: [String: (total: Int, count: Int)] = [:]
        for log in logs {
            if var cur = result[log.placeId] {
                cur.count += 1
                result[log.placeId] = cur
            } else {
                result[log.placeId] = VisitSignal(count: 1, lastVisit: log.visitedAt, lastSentiment: log.sentiment, avgStar: nil)
            }
            if let star = log.starRating {
                var s = starSums[log.placeId] ?? (0, 0)
                s.total += star
                s.count += 1
                starSums[log.placeId] = s
            }
        }
        for (pid, s) in starSums where s.count > 0 {
            result[pid]?.avgStar = Double(s.total) / Double(s.count)
        }
        return result
    }

    /// 保证降序（客户端拿到的数据可能没排）
    public static func sortedDesc(_ logs: [VisitLog]) -> [VisitLog] {
        logs.sorted { $0.visitedAt > $1.visitedAt }
    }
}
