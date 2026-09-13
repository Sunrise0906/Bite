import SwiftUI
import BiteCore

/// 吃喝足迹（web 的 /stats）：KPI + 菜系分布 + 近 6 个月造访
struct StatsView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @State private var places: [Place] = []
    @State private var logs: [VisitLog] = []
    @State private var loaded = false

    private var visited: Int { places.filter { $0.status == .visited }.count }

    private var favCuisine: String {
        let byId = Dictionary(uniqueKeysWithValues: places.map { ($0.id, $0) })
        var c: [String: Int] = [:]
        for l in logs { for x in byId[l.placeId]?.cuisine ?? [] { c[x, default: 0] += 1 } }
        return c.max { $0.value == $1.value ? $0.key > $1.key : $0.value < $1.value }?.key ?? "—"
    }

    private var cuisineDist: [(String, Int)] {
        var c: [String: Int] = [:]
        for p in places { for x in p.cuisine { c[x, default: 0] += 1 } }
        let sorted = c.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }
        var top = sorted.prefix(8).map { ($0.key, $0.value) }
        let rest = sorted.dropFirst(8).reduce(0) { $0 + $1.value }
        if rest > 0 { top.append(("其他", rest)) }
        return top
    }

    private var months: [(label: String, key: String, count: Int)] {
        let cal = Calendar.current
        let now = Date()
        var out: [(String, String, Int)] = []
        for i in stride(from: 5, through: 0, by: -1) {
            let d = cal.date(byAdding: .month, value: -i, to: now)!
            let comps = cal.dateComponents([.year, .month], from: d)
            let key = String(format: "%04d-%02d", comps.year!, comps.month!)
            out.append(("\(comps.month!)月", key, 0))
        }
        for l in logs {
            let key = String(l.visitedAt.prefix(7))
            if let i = out.firstIndex(where: { $0.1 == key }) { out[i].2 += 1 }
        }
        return out.map { (label: $0.0, key: $0.1, count: $0.2) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("吃喝足迹").font(t.display(25)).foregroundStyle(t.ink).padding(.top, 12)
                Text("你和这些店的故事，都记着呢").font(t.text(13)).foregroundStyle(t.muted).padding(.top, 8)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 9) {
                    kpi("\(places.count)", "收进来的店")
                    kpi("\(visited)", "去过的店")
                    kpi("\(logs.count)", "造访记录")
                    kpi(favCuisine, "最爱菜系（按造访）", small: true)
                }
                .padding(.top, 14)

                SectionHeader(title: "菜系分布", trailing: "\(Set(places.flatMap(\.cuisine)).count) 种")
                if cuisineDist.isEmpty {
                    Text("还没有店——先去加几家").font(t.text(13)).foregroundStyle(t.muted).frame(maxWidth: .infinity).padding(.vertical, 20)
                } else {
                    let maxV = max(1, cuisineDist.map(\.1).max() ?? 1)
                    VStack(spacing: 8) {
                        ForEach(cuisineDist, id: \.0) { name, n in
                            HStack(spacing: 10) {
                                Text(name).font(t.text(12)).foregroundStyle(t.ink2).frame(width: 64, alignment: .trailing).lineLimit(1)
                                GeometryReader { g in
                                    ZStack(alignment: .leading) {
                                        RoundedRectangle(cornerRadius: 4).fill(t.surface2)
                                        RoundedRectangle(cornerRadius: 4).fill(t.primary).frame(width: max(6, g.size.width * CGFloat(n) / CGFloat(maxV)))
                                    }
                                }
                                .frame(height: 14)
                                Text("\(n)").font(t.text(12, weight: .semibold)).foregroundStyle(t.muted).frame(width: 26, alignment: .leading)
                            }
                        }
                    }
                }

                SectionHeader(title: "近 6 个月造访", trailing: "\(months.reduce(0) { $0 + $1.count }) 次")
                let maxM = max(1, months.map(\.count).max() ?? 1)
                HStack(alignment: .bottom, spacing: 8) {
                    ForEach(months, id: \.key) { m in
                        VStack(spacing: 4) {
                            Text(m.count > 0 ? "\(m.count)" : " ").font(t.text(11, weight: .semibold)).foregroundStyle(t.muted)
                            RoundedRectangle(cornerRadius: 4).fill(t.sage)
                                .frame(maxWidth: 34)
                                .frame(height: max(m.count > 0 ? 10 : 3, 120 * CGFloat(m.count) / CGFloat(maxM)))
                            Text(m.label).font(t.text(11)).foregroundStyle(t.faint)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 170, alignment: .bottom)
            }
            .bitePage()
            .padding(.bottom, 28)
        }
        .background(t.bg)
        .navigationTitle("吃喝足迹")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if !loaded { LoadingView() } }
        .task { await load() }
    }

    private func kpi(_ n: String, _ label: String, small: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(n).font(t.display(small ? 20 : 27)).foregroundStyle(t.ink).lineLimit(1)
            Text(label).font(t.text(11.5)).foregroundStyle(t.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .biteCard(padding: 14)
    }

    private func load() async {
        guard let uid = session.userId else { return }
        do {
            let lists = try await session.repos.lists.fetchAll()
            places = try await session.repos.places.fetchForLists(lists.map(\.id))
            logs = try await session.repos.visits.fetchMine(userId: uid)
        } catch { session.showError(error) }
        loaded = true
    }
}
