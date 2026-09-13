import Foundation

/// 「离我多远」的纯计算，移植自 bite/src/lib/places/distance.ts。
public struct LatLng: Hashable, Sendable, Codable {
    public var lat: Double
    public var lng: Double
    public init(lat: Double, lng: Double) { self.lat = lat; self.lng = lng }

    /// 定位失败时的兜底中心（尔湾市中心），与 web 一致
    public static let irvineFallback = LatLng(lat: 33.6846, lng: -117.8265)
}

public enum Distance {
    private static let earthRadiusMi = 3958.8

    /// 两点间大圆距离（英里）。用户在南加，看英里比公里自然。
    public static func miles(_ a: LatLng, _ b: LatLng) -> Double {
        func rad(_ d: Double) -> Double { d * .pi / 180 }
        let dLat = rad(b.lat - a.lat)
        let dLng = rad(b.lng - a.lng)
        let h = pow(sin(dLat / 2), 2) + pow(sin(dLng / 2), 2) * cos(rad(a.lat)) * cos(rad(b.lat))
        return 2 * earthRadiusMi * asin(min(1, sqrt(h)))
    }

    /// 近距离一位小数，远了取整；<0.1 mi 显示「就在附近」
    public static func format(_ mi: Double) -> String {
        guard mi.isFinite, mi >= 0 else { return "" }
        if mi < 0.1 { return "就在附近" }
        if mi < 10 { return String(format: "%.1f mi", mi) }
        return "\(Int(mi.rounded())) mi"
    }

    /// Google autocomplete 的 distanceMeters → 「850 m / 1.2 km / 12 km」
    public static func formatMeters(_ meters: Double) -> String {
        if meters < 1000 { return "\(Int(meters.rounded())) m" }
        let km = meters / 1000
        if km < 10 { return String(format: "%.1f km", km) }
        return "\(Int(km.rounded())) km"
    }

    /// 按离 origin 的距离升序排，没有坐标的排最后
    public static func sorted<T>(_ items: [T], origin: LatLng, coords: (T) -> LatLng?) -> [(item: T, miles: Double?)] {
        items.map { item -> (item: T, miles: Double?) in
            if let c = coords(item) { return (item, miles(origin, c)) }
            return (item, nil)
        }
        .sorted { a, b in
            switch (a.miles, b.miles) {
            case (nil, nil): return false
            case (nil, _): return false
            case (_, nil): return true
            case (let x?, let y?): return x < y
            }
        }
    }

    /// 一堆坐标的中位数中心（一个错到别的大洲的点不会把它拽跑）
    public static func medianCenter(_ points: [LatLng]) -> LatLng? {
        guard !points.isEmpty else { return nil }
        func mid(_ xs: [Double]) -> Double {
            let s = xs.sorted()
            let i = s.count / 2
            return s.count % 2 == 1 ? s[i] : (s[i - 1] + s[i]) / 2
        }
        return LatLng(lat: mid(points.map(\.lat)), lng: mid(points.map(\.lng)))
    }

    /// 取景只看「附近那一簇」：半径内不足 minCount 家时取最近的 minCount 家
    public static func nearbyPoints(_ sorted: [(coord: LatLng, miles: Double?)], radiusMi: Double = 25, minCount: Int = 5) -> [LatLng] {
        let near = sorted.filter { ($0.miles ?? .infinity) <= radiusMi }
        let picked = near.count >= minCount ? near : Array(sorted.prefix(minCount))
        return picked.map(\.coord)
    }

    /// 让所有点都进视野的边界（单点时撑开一点）
    public static func bounds(for points: [LatLng]) -> (sw: LatLng, ne: LatLng)? {
        guard let first = points.first else { return nil }
        var minLat = first.lat, maxLat = first.lat, minLng = first.lng, maxLng = first.lng
        for p in points {
            minLat = min(minLat, p.lat); maxLat = max(maxLat, p.lat)
            minLng = min(minLng, p.lng); maxLng = max(maxLng, p.lng)
        }
        if maxLat - minLat < 0.005, maxLng - minLng < 0.005 {
            let pad = 0.01
            return (LatLng(lat: minLat - pad, lng: minLng - pad), LatLng(lat: maxLat + pad, lng: maxLng + pad))
        }
        return (LatLng(lat: minLat, lng: minLng), LatLng(lat: maxLat, lng: maxLng))
    }
}
