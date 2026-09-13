import SwiftUI
import BiteCore

/// 清单页的店铺卡片（web 的 PlaceCardV2）：封面 + 名字 / 元信息 / 理由 / 造访信号，右侧状态 chip + 档位 + 菜单
struct PlaceCardView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var place: Place
    var listId: String
    var cover: String?
    var canEdit: Bool
    var manage: Bool
    var visit: VisitSignal?
    var tierRows: [PlaceRatingRow]
    var reasonAuthors: [String: String]
    var onStatus: (PlaceStatus) -> Void
    var onTier: (PlaceTier?) -> Void
    var onDelete: () -> Void

    var body: some View {
        let uid = session.userId ?? ""
        let shown = place.shownReason(for: uid)
        let author = shown.flatMap { $0.userId != uid ? reasonAuthors[$0.userId] : nil }
        let meta = [place.cuisine.first, place.priceRange?.rawValue, place.address].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let summary = TierSummary.summarize(tierRows, currentUserId: uid)

        HStack(alignment: .top, spacing: 0) {
            NavigationLink(value: AppRoute.place(listId: listId, placeId: place.id)) {
                HStack(alignment: .top, spacing: 12) {
                    RemoteImage(url: cover).frame(width: 88, height: 88)
                        .clipShape(RoundedRectangle(cornerRadius: t.radii.sm, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 7) {
                            Text(place.name).font(t.text(15, weight: .bold)).foregroundStyle(t.ink).lineLimit(1)
                            if !canEdit { PillView(text: place.status.label, style: place.status.pillStyle) }
                        }
                        if !meta.isEmpty {
                            HStack(spacing: 4) {
                                Text(meta).font(t.text(12)).foregroundStyle(t.muted).lineLimit(2)
                                if let r = place.googleRating {
                                    Text("· ★\(String(format: "%.1f", r))").font(t.text(12, weight: .semibold)).foregroundStyle(t.gold)
                                }
                            }
                        }
                        if let shown {
                            HStack(alignment: .top, spacing: 0) {
                                Rectangle().fill(t.gold).frame(width: 2)
                                Text((author.map { "@\($0)：" } ?? "") + shown.text)
                                    .font(t.text(12.5)).foregroundStyle(t.ink2).lineLimit(2)
                                    .padding(.leading, 9)
                            }
                            .padding(.top, 3)
                        }
                        if let v = visit, v.count > 0 {
                            HStack(spacing: 6) {
                                Text("去过 \(v.count) 次")
                                Text("· \(RelDate.label(v.lastVisit))")
                                Text("· \(v.lastSentiment.label)")
                                if let s = v.avgStar { Text("★\(String(format: "%.1f", s))").foregroundStyle(t.gold) }
                            }
                            .font(t.text(11.5)).foregroundStyle(t.sageTx)
                            .padding(.top, 6)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(.plain)

            // 右栏：状态切换（要写权限）+ 档位（读得到就能评）；管理模式换成 编辑 / 删除
            if manage {
                VStack(spacing: 6) {
                    NavigationLink(value: AppRoute.placeForm(listId: listId, placeId: place.id)) {
                        Text("编辑").font(t.text(11.5, weight: .bold)).foregroundStyle(t.ink2)
                            .frame(width: 52).padding(.vertical, 4)
                            .overlay(Capsule().stroke(t.border2, lineWidth: t.bw))
                    }
                    Button(action: onDelete) {
                        Text("删除").font(t.text(11.5, weight: .bold)).foregroundStyle(t.danger)
                            .frame(width: 52).padding(.vertical, 4)
                            .overlay(Capsule().stroke(t.danger, lineWidth: t.bw))
                    }
                }
                .padding(.leading, 10)
                .overlay(alignment: .leading) { Rectangle().fill(t.border).frame(width: 1) }
            } else {
                VStack(alignment: .trailing, spacing: 6) {
                    if canEdit {
                        StatusQuickToggle(placeId: place.id, status: place.status, onChange: onStatus)
                    }
                    TierQuickPick(placeId: place.id, listId: listId, summary: summary, onChange: onTier)
                    Link(destination: ExternalLinks.menuURL(name: place.name, address: place.address, websiteUri: place.websiteUri)) {
                        VStack(spacing: 2) {
                            Image(systemName: "menucard").font(.system(size: 16))
                            Text("菜单").font(t.text(11, weight: .bold))
                        }
                        .foregroundStyle(t.primary)
                    }
                    .padding(.top, 4)
                }
                .padding(.leading, 10)
            }
        }
        .biteCard(padding: 11, radius: t.radii.lg)
    }
}

/// 状态 chip 一键切换（乐观更新，失败回滚）
struct StatusQuickToggle: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var placeId: String
    var status: PlaceStatus
    var onChange: (PlaceStatus) -> Void
    @State private var busy = false

    var body: some View {
        Menu {
            ForEach(PlaceStatus.displayOrder, id: \.self) { s in
                Button {
                    Task { await pick(s) }
                } label: {
                    if s == status { Label(s.formLabel, systemImage: "checkmark") } else { Text(s.formLabel) }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(busy ? "…" : status.label)
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).opacity(0.7)
            }
            .font(t.text(11.5, weight: .semibold))
            .foregroundStyle(status.pillStyle == .want ? t.goldTx : status.pillStyle == .visited ? t.sageTx : t.muted)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(status.pillStyle == .want ? t.goldSoft : status.pillStyle == .visited ? t.sageSoft : t.sunken)
            .clipShape(Capsule())
        }
        .disabled(busy)
    }

    private func pick(_ next: PlaceStatus) async {
        guard next != status else { return }
        let prev = status
        onChange(next)
        busy = true; defer { busy = false }
        do { try await session.repos.places.updateStatus(id: placeId, status: next) }
        catch { onChange(prev); session.showError(error) }
    }
}

/// 一键档位（夯 / 顶级 / 人上人 / NPC / 拉完了）。不看 canEdit —— viewer 也能评（sql/0028）
struct TierQuickPick: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    var placeId: String
    var listId: String
    var summary: TierSummary
    var showOthers: Bool = false
    var authors: [String: String] = [:]
    var onChange: (PlaceTier?) -> Void
    @State private var busy = false

    var body: some View {
        VStack(alignment: .trailing, spacing: 5) {
            Menu {
                ForEach(PlaceTier.ordered, id: \.self) { tier in
                    Button {
                        Task { await pick(tier) }
                    } label: {
                        if summary.mine == tier { Label("\(tier.label) · \(tier.blurb)", systemImage: "checkmark") }
                        else { Text("\(tier.label) · \(tier.blurb)") }
                    }
                }
                if summary.mine != nil {
                    Divider()
                    Button("撤销我的评价", role: .destructive) { Task { await pick(nil) } }
                }
            } label: {
                if busy {
                    Text("…").font(t.text(11.5, weight: .bold)).foregroundStyle(t.muted)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                } else {
                    TierPill(tier: summary.mine)
                }
            }
            .disabled(busy)

            if showOthers, !summary.others.isEmpty {
                HStack(spacing: 8) {
                    ForEach(summary.others, id: \.userId) { o in
                        HStack(spacing: 2) {
                            Text("@\(authors[o.userId] ?? "朋友")")
                            Text(PlaceTier(rawValue: o.tier)?.label ?? "").fontWeight(.bold)
                        }
                    }
                }
                .font(t.text(11)).foregroundStyle(t.muted)
            }
        }
    }

    private func pick(_ tier: PlaceTier?) async {
        guard let uid = session.userId, tier != summary.mine else { return }
        let prev = summary.mine
        onChange(tier)
        busy = true; defer { busy = false }
        do {
            if let tier { try await session.repos.ratings.set(placeId: placeId, listId: listId, userId: uid, tier: tier) }
            else { try await session.repos.ratings.clear(placeId: placeId, userId: uid) }
        } catch {
            onChange(prev)
            session.showError(error)
        }
    }
}
