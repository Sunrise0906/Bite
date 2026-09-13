import Foundation

/// 「快捷评价」档位表 —— 移植自 bite/src/lib/places/tier.ts。
///
/// ⚠️⚠️ 极性陷阱：这里 **1 是最好**（夯），5 是最差（拉完了）。
/// 而 visit_logs.star_rating 是 **5 最好**。两个 1-5 反着来，比较一律走
/// isBetter / best，别直接比数字（TierTests 钉住了这个方向）。
public enum PlaceTier: Int, Codable, CaseIterable, Sendable, Comparable {
    case top = 1        // 夯
    case great = 2      // 顶级
    case good = 3       // 人上人
    case npc = 4        // NPC
    case bad = 5        // 拉完了

    public var label: String {
        switch self {
        case .top: return "夯"
        case .great: return "顶级"
        case .good: return "人上人"
        case .npc: return "NPC"
        case .bad: return "拉完了"
        }
    }

    /// 选择器里的一行小字
    public var blurb: String {
        switch self {
        case .top: return "封神，逢人就安利"
        case .great: return "很能打，会专门再来"
        case .good: return "比大多数强，路过会进"
        case .npc: return "没记忆点，可去可不去"
        case .bad: return "别去了"
        }
    }

    /// 从最好到最差 = rawValue 升序
    public static let ordered: [PlaceTier] = [.top, .great, .good, .npc, .bad]

    /// **数值更小 = 更好**，所以 `<` 意味着「更好」。
    public static func < (lhs: PlaceTier, rhs: PlaceTier) -> Bool { lhs.rawValue < rhs.rawValue }

    /// a 是不是比 b 更好
    public static func isBetter(_ a: PlaceTier, than b: PlaceTier) -> Bool { a.rawValue < b.rawValue }

    /// 一组里最好的（空 → nil）
    public static func best(of tiers: [PlaceTier]) -> PlaceTier? { tiers.min() }

    /// 任意值（Int / 数字串）→ 档位；解析不出来 = nil（没评过）
    public static func parse(_ raw: Any?) -> PlaceTier? {
        if let i = raw as? Int { return PlaceTier(rawValue: i) }
        if let d = raw as? Double, d == d.rounded() { return PlaceTier(rawValue: Int(d)) }
        if let s = raw as? String, let i = Int(s.trimmingCharacters(in: .whitespaces)) { return PlaceTier(rawValue: i) }
        return nil
    }
}

public struct TierSummary: Hashable, Sendable {
    /// 当前用户自己评的（没评过 = nil）
    public var mine: PlaceTier?
    /// 别人评的，按档位从好到差排
    public var others: [PlaceRatingRow]
    /// 全部人里最好的一档（含自己）
    public var best: PlaceTier?
    /// 总共几个人评过（含自己）
    public var count: Int

    public static let empty = TierSummary(mine: nil, others: [], best: nil, count: 0)

    public init(mine: PlaceTier?, others: [PlaceRatingRow], best: PlaceTier?, count: Int) {
        self.mine = mine; self.others = others; self.best = best; self.count = count
    }

    /// 把一家店的原始评价行折成展示用的摘要。共享清单里每人各评各的，
    /// 显示「我的档位 + 别人怎么看」而不是求平均（平均会把「夯 + 拉完了」抹成人上人）。
    public static func summarize(_ rows: [PlaceRatingRow], currentUserId: String) -> TierSummary {
        var mine: PlaceTier?
        var others: [PlaceRatingRow] = []
        for r in rows {
            guard PlaceTier(rawValue: r.tier) != nil else { continue }
            if r.userId == currentUserId { mine = PlaceTier(rawValue: r.tier) } else { others.append(r) }
        }
        others.sort { $0.tier < $1.tier }
        var all = others.compactMap { PlaceTier(rawValue: $0.tier) }
        if let m = mine { all.append(m) }
        return TierSummary(mine: mine, others: others, best: PlaceTier.best(of: all), count: all.count)
    }
}
