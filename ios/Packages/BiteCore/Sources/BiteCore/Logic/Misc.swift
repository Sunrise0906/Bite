import Foundation

/// 「一起选」的判定规则（bite/src/lib/pick/rules.ts）：简单多数，下限 2。
public enum PickRules {
    public static func votesNeeded(memberCount: Int) -> Int {
        max(2, memberCount / 2 + 1)
    }
}

/// 「刚刚在线」（bite/src/lib/presence/active.ts）：5 分钟内打过心跳
public enum Presence {
    public static let activeWindow: TimeInterval = 5 * 60

    public static func isActive(_ lastSeenAt: String?, now: Date = Date()) -> Bool {
        guard let d = BiteDate.parse(lastSeenAt) else { return false }
        // 未来时间也算活跃（客户端时钟偏了），总比显示「离线」强
        return now.timeIntervalSince(d) <= activeWindow
    }
}

/// 外部直达链接（bite/src/lib/places/menu-url.ts）
public enum ExternalLinks {
    /// 一键看菜单：优先 Google Places 的 websiteUri（餐厅多为点单页），没有就 Google 搜索
    public static func menuURL(name: String, address: String?, websiteUri: String?) -> URL {
        if let site = websiteUri?.trimmingCharacters(in: .whitespaces),
           site.lowercased().hasPrefix("http"), let u = URL(string: site) {
            return u
        }
        return menuSearchURL(name: name, address: address)
    }

    public static func menuSearchURL(name: String, address: String?) -> URL {
        let q = [name, address?.trimmingCharacters(in: .whitespaces), "menu 菜单"]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        return URL(string: "https://www.google.com/search?q=\(enc)")!
    }

    /// 导航：有坐标用坐标，否则店名 + 地址
    public static func mapsURL(name: String, address: String, lat: Double?, lng: Double?) -> URL {
        if let lat, let lng {
            return URL(string: "https://www.google.com/maps/search/?api=1&query=\(lat),\(lng)")!
        }
        let q = "\(name) \(address)".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? name
        return URL(string: "https://www.google.com/maps/search/?api=1&query=\(q)")!
    }

    /// 小红书 App 深链（网页搜索路径全是死的，只能唤起 App，见 xhs-search-button.tsx）
    public static func xhsSearchURL(name: String) -> URL? {
        let q = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? name
        return URL(string: "xhsdiscover://search/result?keyword=\(q)")
    }
}

/// 表单标签串解析（bite/src/lib/places/parse-form.ts）：英文逗号 / 中文逗号 / 顿号 / 空白都算分隔
public enum ParseTags {
    public static func parse(_ raw: String) -> [String] {
        raw.components(separatedBy: CharacterSet(charactersIn: ",，、").union(.whitespacesAndNewlines))
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
}

/// 清单领域对应的字段语义（bite/src/lib/places/domain.ts）：cuisine 在「玩」里叫「类型」
public struct DomainVocab: Sendable {
    public var noun: String
    public var typeLabel: String
    public var typeExamples: [String]
    public var priceLabel: String
    public var priceHint: String
    public var highlightLabel: String
    public var highlightHint: String

    public static func vocab(for category: ListCategory?) -> DomainVocab {
        switch category ?? .food {
        case .food:
            return DomainVocab(noun: "餐厅", typeLabel: "菜系",
                               typeExamples: ["中餐", "川菜", "粤菜", "火锅", "面食", "日料", "寿司", "拉面", "韩餐", "烧烤", "美式", "墨西哥菜", "越南菜", "泰餐", "台菜", "上海菜"],
                               priceLabel: "人均", priceHint: "人均消费", highlightLabel: "招牌菜",
                               highlightHint: "原文点名推荐的具体菜")
        case .drink:
            return DomainVocab(noun: "店", typeLabel: "品类",
                               typeExamples: ["咖啡", "手冲", "奶茶", "果茶", "酒吧", "清吧", "精酿", "甜品", "烘焙", "冰淇淋", "果汁"],
                               priceLabel: "人均", priceHint: "人均消费", highlightLabel: "招牌",
                               highlightHint: "原文点名推荐的具体饮品/甜点")
        case .activity:
            return DomainVocab(noun: "去处", typeLabel: "类型",
                               typeExamples: ["展览", "美术馆", "博物馆", "徒步", "海滩", "公园", "密室", "剧本杀", "livehouse", "演出", "电影", "球场", "保龄球", "露营", "温泉", "市集"],
                               priceLabel: "花费", priceHint: "门票或人均消费（免费就省略）", highlightLabel: "亮点",
                               highlightHint: "原文点名值得看/玩的具体项目")
        case .other:
            return DomainVocab(noun: "去处", typeLabel: "类型",
                               typeExamples: ["购物", "书店", "理发", "健身", "宠物", "生活服务"],
                               priceLabel: "花费", priceHint: "人均消费（不明确就省略）", highlightLabel: "亮点",
                               highlightHint: "原文点名推荐的具体项目")
        }
    }
}
