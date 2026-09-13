import Foundation

/// 「3 天前 / 1 周前 / 1 月前 / 1 年前」，移植自 bite/src/lib/util/rel-date.ts。
/// 未来时间（时钟漂移）一律按「今天」，别露出「-1 年前」。
public enum RelDate {
    public static func label(_ iso: String?, now: Date = Date()) -> String {
        guard let d = BiteDate.parse(iso) else { return "" }
        return label(d, now: now)
    }

    public static func label(_ d: Date, now: Date = Date()) -> String {
        let days = Int(floor(now.timeIntervalSince(d) / 86_400))
        if days < 0 { return "今天" }
        if days == 0 { return "今天" }
        if days == 1 { return "昨天" }
        if days < 7 { return "\(days) 天前" }
        if days < 30 { return "\(days / 7) 周前" }
        if days < 365 { return "\(days / 30) 月前" }
        return "\(days / 365) 年前"
    }

    /// 主页清单行的「2 个月前 / 刚刚 / 3 小时前」（web 用 Intl.RelativeTimeFormat，这里手写中文）
    public static func relativeTime(_ iso: String?, now: Date = Date()) -> String {
        guard let d = BiteDate.parse(iso) else { return "" }
        let sec = now.timeIntervalSince(d)
        if sec < 45 { return "刚刚" }
        let min = sec / 60
        if min < 60 { return "\(Int(min.rounded())) 分钟前" }
        let hr = min / 60
        if hr < 24 { return "\(Int(hr.rounded())) 小时前" }
        let day = hr / 24
        if day < 7 { return "\(Int(day.rounded())) 天前" }
        let week = day / 7
        if week < 4.35 { return "\(Int(week.rounded())) 周前" }
        let month = day / 30.44
        if month < 12 { return "\(max(1, Int(month.rounded()))) 个月前" }
        return "\(max(1, Int((day / 365).rounded()))) 年前" 
    }

    /// 聊天气泡上的短时间：同一天 HH:mm，否则 M/d HH:mm
    public static func brief(_ iso: String?, now: Date = Date(), calendar: Calendar = .current) -> String {
        guard let d = BiteDate.parse(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.dateFormat = calendar.isDate(d, inSameDayAs: now) ? "HH:mm" : "M/d HH:mm"
        return f.string(from: d)
    }

    /// 造访记录的日期：2026/08/10
    public static func ymd(_ iso: String?) -> String {
        guard let d = BiteDate.parse(iso) else { return iso.map { String($0.prefix(10)) } ?? "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.dateFormat = "yyyy/MM/dd"
        return f.string(from: d)
    }
}
