import SwiftUI
import MapKit
import BiteCore

/// 「附近去哪」（web 的 /map + nearby-view.tsx）：定位 → 按距离排 → 地图（MapKit）+ 可点列表
struct NearbyView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @State private var places: [Place] = []
    @State private var needEnrich = 0
    @State private var geo: (origin: LatLng, real: Bool)?
    @State private var geoState: GeoState = .asking
    @State private var statusFilter: PlaceStatus? = .wantToGo
    @State private var cuisineSel: String?
    @State private var activeId: String?
    @State private var camera: MapCameraPosition = .automatic
    @State private var fittedKey = ""
    @State private var enriching = false
    @State private var enrichMessage: String?
    @State private var location = LocationService()
    @State private var loaded = false

    enum GeoState { case asking, done, denied }

    private var cuisines: [(String, Int)] {
        var c: [String: Int] = [:]
        for p in places { for x in p.cuisine { c[x, default: 0] += 1 } }
        return c.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }.prefix(8).map { ($0.key, $0.value) }
    }

    private var ranked: [(item: Place, miles: Double?)] {
        let filtered = places.filter { p in
            if let s = statusFilter, p.status != s { return false }
            if let c = cuisineSel, !p.cuisine.contains(c) { return false }
            return true
        }
        guard let geo else { return filtered.map { ($0, nil) } }
        return Distance.sorted(filtered, origin: geo.origin) { p in
            if let lat = p.lat, let lng = p.lng { return LatLng(lat: lat, lng: lng) }
            return nil
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("附近去哪").font(t.display(25)).foregroundStyle(t.ink)
                    Text(places.isEmpty ? "还没有带坐标的店" : "\(places.count) 家有坐标 · 按离你的距离排").font(t.text(13)).foregroundStyle(t.muted)
                }
                .padding(.top, 18).padding(.bottom, 14)

                if places.isEmpty, loaded {
                    EmptyStateView(title: "还没有能上地图的店",
                                   subtitle: needEnrich > 0 ? "在 Google 上找到你的店，就能拿到坐标和评分，按距离排给你。" : "加店时用 Google 搜索会自动带坐标。")
                    if needEnrich > 0 { enrichButton }
                } else if !loaded {
                    LoadingView()
                } else {
                    geoLine.padding(.bottom, 10)
                    FilterRow {
                        FilterChip(text: "想去", on: statusFilter == .wantToGo) { statusFilter = .wantToGo }
                        FilterChip(text: "去过", on: statusFilter == .visited) { statusFilter = .visited }
                        FilterChip(text: "全部", on: statusFilter == nil) { statusFilter = nil }
                    }
                    .padding(.bottom, 8)
                    if !cuisines.isEmpty {
                        FilterRow {
                            ForEach(cuisines, id: \.0) { c, n in
                                FilterChip(text: "\(c) \(n)", on: cuisineSel == c) { cuisineSel = cuisineSel == c ? nil : c }
                            }
                        }
                        .padding(.bottom, 12)
                    }
                    map.frame(height: 300)
                        .clipShape(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: t.radii.lg, style: .continuous).stroke(t.border, lineWidth: t.bw))
                    if ranked.isEmpty {
                        EmptyStateView(title: "没有符合条件的店", subtitle: "换个状态或菜系试试")
                    } else {
                        VStack(spacing: 8) {
                            ForEach(Array(ranked.enumerated()), id: \.element.item.id) { i, r in row(i + 1, r.item, r.miles) }
                        }
                        .padding(.top, 14)
                    }
                    if needEnrich > 0 { enrichButton.padding(.top, 14) }
                }
            }
            .bitePage()
            .padding(.bottom, 28)
        }
        .background(t.bg)
        .navigationBarHidden(true)
        .refreshable { await load() }
        .task {
            await load()
            let origin = await location.requestOnce()
            if let origin { geo = (origin, true); geoState = .done } else { geo = (LatLng.irvineFallback, false); geoState = .denied }
        }
        .onChange(of: ranked.map(\.item.id).joined()) { _, _ in fitCamera() }
        .onChange(of: geoState) { _, _ in fitCamera() }
    }

    private var geoLine: some View {
        Group {
            switch geoState {
            case .asking: Text("正在定位…")
            case .done: Text("已按离你的距离排序")
            case .denied: Text("没拿到定位权限，下面按「离尔湾市中心」的距离排 —— 不是离你").foregroundStyle(t.goldTx)
            }
        }
        .font(t.text(12)).foregroundStyle(t.muted)
    }

    private var map: some View {
        Map(position: $camera) {
            if geo?.real == true { UserAnnotation() }
            ForEach(ranked.map(\.item).filter(\.hasCoordinates)) { p in
                Annotation(p.name, coordinate: CLLocationCoordinate2D(latitude: p.lat!, longitude: p.lng!), anchor: .center) {
                    Circle().fill(color(p.status))
                        .frame(width: activeId == p.id ? 20 : 15, height: activeId == p.id ? 20 : 15)
                        .overlay(Circle().stroke(.white, lineWidth: activeId == p.id ? 3 : 2))
                        .onTapGesture { activeId = p.id }
                }
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .mapControls { MapCompass() }
    }

    private func color(_ s: PlaceStatus) -> Color {
        switch s {
        case .wantToGo: return Color(hex: "#b8862f")
        case .visited: return Color(hex: "#5f7155")
        case .archived: return Color(hex: "#a89c84")
        }
    }

    private func row(_ n: Int, _ p: Place, _ miles: Double?) -> some View {
        HStack(spacing: 11) {
            Button { focus(p) } label: {
                VStack(spacing: 1) {
                    Circle().fill(color(p.status)).frame(width: 10, height: 10)
                    Text("\(n)").font(t.text(11, weight: .bold)).foregroundStyle(t.muted)
                }
                .frame(width: 34)
            }
            NavigationLink(value: AppRoute.place(listId: p.listId, placeId: p.id)) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(p.name).font(t.text(15, weight: .semibold)).foregroundStyle(t.ink).lineLimit(1)
                    HStack(spacing: 4) {
                        if let m = miles {
                            Text(Distance.format(m)).font(t.text(12, weight: .bold)).foregroundStyle(t.primarySoftTx)
                                .padding(.horizontal, 7).padding(.vertical, 1).background(t.primarySoft).clipShape(Capsule())
                        }
                        if let c = p.cuisine.first { Text("· \(c)") }
                        if let pr = p.priceRange { Text("· \(pr.rawValue)") }
                        if let r = p.googleRating { Text("· ★\(String(format: "%.1f", r))").foregroundStyle(t.goldTx) }
                    }
                    .font(t.text(12)).foregroundStyle(t.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            Link("菜单", destination: ExternalLinks.menuURL(name: p.name, address: p.address, websiteUri: p.websiteUri))
                .font(t.text(12, weight: .semibold)).foregroundStyle(t.ink2)
                .padding(.horizontal, 11).padding(.vertical, 5)
                .overlay(Capsule().stroke(t.border2, lineWidth: t.bw))
        }
        .biteCard(padding: 10, radius: t.radii.md)
        .overlay(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous).stroke(activeId == p.id ? t.primary : .clear, lineWidth: t.bw))
    }

    private var enrichButton: some View {
        VStack(spacing: 8) {
            Button(enriching ? "在 Google 上查…" : "在 Google 上丰富 \(needEnrich) 家店（评分 + 坐标）") { Task { await enrich() } }
                .buttonStyle(.bite(.primary)).disabled(enriching)
            if let m = enrichMessage { Text(m).font(t.text(12.5)).foregroundStyle(t.muted).multilineTextAlignment(.center) }
        }
        .frame(maxWidth: .infinity)
    }

    private func focus(_ p: Place) {
        activeId = p.id
        guard let lat = p.lat, let lng = p.lng else { return }
        withAnimation { camera = .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng), latitudinalMeters: 1500, longitudinalMeters: 1500)) }
    }

    /// 取景只看附近那一簇（一家店坐标错到别的国家也不该把视野撑成世界地图）
    private func fitCamera() {
        let sorted = ranked.compactMap { r -> (coord: LatLng, miles: Double?)? in
            guard let lat = r.item.lat, let lng = r.item.lng else { return nil }
            return (LatLng(lat: lat, lng: lng), r.miles)
        }
        var pts = Distance.nearbyPoints(sorted)
        if let geo, geo.real { pts.append(geo.origin) }
        let key = pts.map { "\($0.lat),\($0.lng)" }.joined(separator: "|")
        guard key != fittedKey, let b = Distance.bounds(for: pts) else { return }
        fittedKey = key
        let center = CLLocationCoordinate2D(latitude: (b.sw.lat + b.ne.lat) / 2, longitude: (b.sw.lng + b.ne.lng) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max(0.02, (b.ne.lat - b.sw.lat) * 1.3), longitudeDelta: max(0.02, (b.ne.lng - b.sw.lng) * 1.3))
        withAnimation { camera = .region(MKCoordinateRegion(center: center, span: span)) }
    }

    private func load() async {
        do {
            let lists = try await session.repos.lists.fetchAll()
            let all = try await session.repos.places.fetchForLists(lists.map(\.id))
            places = all.filter(\.hasCoordinates)
            needEnrich = all.filter { $0.googleRating == nil || $0.websiteUri == nil }.count
        } catch {
            session.showError(error)
        }
        loaded = true
    }

    private func enrich() async {
        enriching = true; enrichMessage = nil
        defer { enriching = false }
        do {
            let r = try await session.api.enrichFromGoogle()
            if r.enriched > 0 {
                enrichMessage = "已从 Google 拿到 \(r.enriched) 家店的评分 + 坐标" + (r.healed > 0 ? "，并修正了 \(r.healed) 家标错位置的店" : "")
                await load()
            } else {
                enrichMessage = r.tried > 0 ? "这些店没在 Google 上找到（名字/地址太模糊，或 Places API 没开）" : "没有需要丰富的店"
            }
        } catch { enrichMessage = ErrorText.friendly(error) }
    }
}
