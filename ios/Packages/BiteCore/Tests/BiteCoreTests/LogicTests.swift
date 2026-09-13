import Foundation
import Testing
@testable import BiteCore

@Suite struct NameKeyTests {
    @Test func testCurlyApostropheAndCaseCollapse() {
        // 真实事故：MOri’s（U+2019）vs MOri's vs Mori's
        #expect(NameKey.normalize("MOri\u{2019}s") == NameKey.normalize("MOri's"))
        #expect(NameKey.normalize("MOri's") == NameKey.normalize("Mori's"))
        #expect(NameKey.same("  海底捞  ", "海底捞"))
        #expect(!(NameKey.same("海底捞", "海底捞火锅")))
    }

    @Test func testFullWidthAndWhitespace() {
        #expect(NameKey.normalize("ＭＯｒｉ　ｓ") == "mori s")
        #expect(NameKey.normalize("a   b\n c") == "a b c")
        #expect(NameKey.findSame("x", in: []) == nil)
        #expect(NameKey.findSame("mori's", in: ["MOri\u{2019}s", "其他"]) == "MOri\u{2019}s")
    }
}

@Suite struct TierTests {
    @Test func testPolarityOneIsBest() {
        // ⚠️ 1 最好，5 最差 —— 这条断言钉住方向
        #expect(PlaceTier.isBetter(.top, than: .bad))
        #expect(!(PlaceTier.isBetter(.bad, than: .top)))
        #expect(PlaceTier.best(of: [.npc, .great, .bad]) == .great)
        #expect(PlaceTier.best(of: []) == nil)
        #expect(PlaceTier.ordered.map(\.rawValue) == [1, 2, 3, 4, 5])
        #expect(PlaceTier.ordered.map(\.label) == ["夯", "顶级", "人上人", "NPC", "拉完了"])
    }

    @Test func testParse() {
        #expect(PlaceTier.parse(3) == .good)
        #expect(PlaceTier.parse("5") == .bad)
        #expect(PlaceTier.parse(6) == nil)
        #expect(PlaceTier.parse("") == nil)
        #expect(PlaceTier.parse(nil) == nil)
    }

    @Test func testSummarize() {
        let rows = [
            PlaceRatingRow(placeId: "p", userId: "me", tier: 4),
            PlaceRatingRow(placeId: "p", userId: "gf", tier: 1),
            PlaceRatingRow(placeId: "p", userId: "bad", tier: 9),
        ]
        let s = TierSummary.summarize(rows, currentUserId: "me")
        #expect(s.mine == .npc)
        #expect(s.others.map(\.userId) == ["gf"])
        #expect(s.best == .top)
        #expect(s.count == 2)
    }
}

@Suite struct DistanceTests {
    @Test func testMilesAndFormat() {
        let irvine = LatLng(lat: 33.6846, lng: -117.8265)
        let rowland = LatLng(lat: 33.9761, lng: -117.9053)
        let mi = Distance.miles(irvine, rowland)
        #expect(mi > 20); #expect(mi < 24)
        #expect(Distance.format(0.05) == "就在附近")
        #expect(Distance.format(0.83) == "0.8 mi")
        #expect(Distance.format(12.4) == "12 mi")
        #expect(Distance.format(-1) == "")
        #expect(Distance.formatMeters(850) == "850 m")
        #expect(Distance.formatMeters(1234) == "1.2 km")
    }

    @Test func testSortPutsMissingCoordsLast() {
        struct P { let name: String; let c: LatLng? }
        let origin = LatLng(lat: 0, lng: 0)
        let items = [P(name: "none", c: nil), P(name: "far", c: LatLng(lat: 1, lng: 1)), P(name: "near", c: LatLng(lat: 0.1, lng: 0))]
        let sorted = Distance.sorted(items, origin: origin, coords: { $0.c })
        #expect(sorted.map(\.item.name) == ["near", "far", "none"])
        #expect(sorted.last?.miles == nil)
    }

    @Test func testMedianCenterIgnoresOutlier() {
        let pts = [LatLng(lat: 33.6, lng: -117.8), LatLng(lat: 33.7, lng: -117.9), LatLng(lat: 10.8, lng: 106.6)]
        let c = Distance.medianCenter(pts)!
        #expect(abs((c.lat) - (33.6)) < 0.2)
        #expect(abs((c.lng) - (-117.8)) < 0.2)
    }
}

@Suite struct VisitAggregateTests {
    @Test func testSignals() {
        let logs = [
            VisitLog(id: "1", placeId: "a", userId: "u", visitedAt: "2026-08-10T12:00:00Z", sentiment: .willReturn, starRating: 5),
            VisitLog(id: "2", placeId: "a", userId: "u", visitedAt: "2026-07-01T12:00:00Z", sentiment: .okay, starRating: nil),
            VisitLog(id: "3", placeId: "a", userId: "u", visitedAt: "2026-06-01T12:00:00Z", sentiment: .okay, starRating: 3),
            VisitLog(id: "4", placeId: "b", userId: "u", visitedAt: "2026-05-01T12:00:00Z", sentiment: .wontReturn),
        ]
        let s = VisitAggregate.signals(VisitAggregate.sortedDesc(logs))
        #expect(s["a"]?.count == 3)
        #expect(s["a"]?.lastSentiment == .willReturn)
        #expect(s["a"]?.avgStar == 4)
        #expect(s["b"]?.avgStar == nil)
        #expect(s["b"]?.lastSentiment == .wontReturn)
    }
}

@Suite struct RelDateTests {
    @Test func testLabels() {
        let now = BiteDate.parse("2026-09-12T12:00:00Z")!
        #expect(RelDate.label("2026-09-12T08:00:00Z", now: now) == "今天")
        #expect(RelDate.label("2026-09-11T08:00:00Z", now: now) == "昨天")
        #expect(RelDate.label("2026-09-09T12:00:00Z", now: now) == "3 天前")
        #expect(RelDate.label("2026-08-29T12:00:00Z", now: now) == "2 周前")
        #expect(RelDate.label("2026-06-01T12:00:00Z", now: now) == "3 月前")
        #expect(RelDate.label("2024-06-01T12:00:00Z", now: now) == "2 年前")
        #expect(RelDate.label("2027-01-01T12:00:00Z", now: now) == "今天") // 时钟漂移
        #expect(RelDate.label("garbage", now: now) == "")
        #expect(RelDate.relativeTime("2026-09-12T11:59:50Z", now: now) == "刚刚")
        #expect(RelDate.relativeTime("2026-07-10T12:00:00Z", now: now) == "2 个月前")
    }

    @Test func testBiteDateParsesPostgresVariants() {
        #expect(BiteDate.parse("2026-08-10T12:34:56.789+00:00") != nil)
        #expect(BiteDate.parse("2026-08-10T12:34:56+00:00") != nil)
        #expect(BiteDate.parse("2026-08-10T12:34:56Z") != nil)
        #expect(BiteDate.parse("2026-08-10 12:34:56+00") != nil)
        #expect(BiteDate.parse("2026-08-10") != nil)
        #expect(BiteDate.parse(nil) == nil)
        #expect(BiteDate.parse("") == nil)
    }
}

@Suite struct QuickAddDetectTests {
    @Test func testDetect() {
        #expect(QuickAddDetect.detect("  ") == .empty)
        #expect(QuickAddDetect.detect("海底捞") == .placeName)
        #expect(QuickAddDetect.detect(String(repeating: "长", count: 13)) == .freeText(hasXhsUrl: false))
        #expect(QuickAddDetect.detect("看看 http://xhslink.cn/o/abc123 好吃") == .freeText(hasXhsUrl: true))
        #expect(QuickAddDetect.detect("https://www.xiaohongshu.com/explore/66a1?xsec=1") == .freeText(hasXhsUrl: true))
        #expect(QuickAddDetect.detect("a\nb") == .freeText(hasXhsUrl: false))
    }

    @Test func testExtractAndStrip() {
        let t = "看看 http://xhslink.com/a/xyz 这家，来自朋友"
        #expect(QuickAddDetect.extractXhsUrl(t) == "http://xhslink.com/a/xyz")
        #expect(QuickAddDetect.stripXhsUrl(t) == "看看  这家，来自朋友")
        #expect(QuickAddDetect.extractXhsUrl("https://google.com/x") == nil)
    }
}

@Suite struct LinkifyTests {
    @Test func testSegments() {
        let map = ["鼎泰丰": Linkify.PlaceRef(id: "p1", listId: "l1")]
        let segs = Linkify.segments("推荐 «鼎泰丰» 和 «不存在» 吧", placeMap: map)
        #expect(segs == [
            .text("推荐 "), .link(name: "鼎泰丰", listId: "l1", placeId: "p1"), .text(" 和 "), .raw("«不存在»"), .text(" 吧"),
        ])
        #expect(Linkify.segments("没有书名号", placeMap: map) == [.text("没有书名号")])
        #expect(Linkify.mentionedNames("«A» «B» «A»") == ["A", "B"])
    }
}

@Suite struct ToolSummaryTests {
    @Test func testSummaries() {
        #expect(ToolSummary.summarize(toolName: "search_my_list", content: nil).kind == .pending)
        #expect(ToolSummary.summarize(toolName: "search_my_list", content: "{\"count\":3}").summary == "找到 3 家")
        #expect(ToolSummary.summarize(toolName: "search_my_list", content: "{\"count\":0,\"note\":\"用户还没有任何 list\"}").summary == "找到 0 家（用户还没有任何 list）")
        #expect(ToolSummary.summarize(toolName: "check_place_details", content: "{\"name\":\"X\"}").summary == "«X»")
        #expect(ToolSummary.summarize(toolName: "add_to_list", content: "{\"error\":\"坏了\"}").kind == .error)
        #expect(ToolSummary.summarize(toolName: "x", content: "not json").kind == .error)
        #expect(ToolSummary.label(forTool: "find_similar_places") == "找相似的店")
    }
}

@Suite struct MiscTests {
    @Test func testPickRules() {
        #expect(PickRules.votesNeeded(memberCount: 1) == 2)
        #expect(PickRules.votesNeeded(memberCount: 2) == 2)
        #expect(PickRules.votesNeeded(memberCount: 3) == 2)
        #expect(PickRules.votesNeeded(memberCount: 4) == 3)
        #expect(PickRules.votesNeeded(memberCount: 5) == 3)
    }

    @Test func testPresence() {
        let now = Date()
        #expect(Presence.isActive(BiteDate.string(now.addingTimeInterval(-60)), now: now))
        #expect(!(Presence.isActive(BiteDate.string(now.addingTimeInterval(-600)), now: now)))
        #expect(!(Presence.isActive(nil, now: now)))
    }

    @Test func testMenuURLPrefersWebsite() {
        #expect(ExternalLinks.menuURL(name: "X", address: nil, websiteUri: "https://order.toasttab.com/x").absoluteString == "https://order.toasttab.com/x")
        #expect(ExternalLinks.menuURL(name: "X", address: "Irvine", websiteUri: "").absoluteString.hasPrefix("https://www.google.com/search?q="))
    }

    @Test func testParseTags() {
        #expect(ParseTags.parse("川菜, 火锅，日料、 寿司  拉面") == ["川菜", "火锅", "日料", "寿司", "拉面"])
        #expect(ParseTags.parse("") == [])
    }
}

@Suite struct PhotoURLTests {
    let base = "https://abc.supabase.co"

    @Test func testNormalizeSignedToCanonical() {
        let signed = "\(base)/storage/v1/object/sign/photos/uid/1-a.jpg?token=xyz"
        #expect(PhotoURL.normalize(signed, supabaseURL: base) == "\(base)/storage/v1/object/public/photos/uid/1-a.jpg")
        let ext = "https://cdn.xhs.com/a.jpg"
        #expect(PhotoURL.normalize(ext, supabaseURL: base) == ext)
    }

    @Test func testObjectPath() {
        #expect(PhotoURL.objectPath("\(base)/storage/v1/object/public/photos/uid/x%20y.jpg", supabaseURL: base) == "uid/x y.jpg")
        #expect(PhotoURL.objectPath("https://cdn.xhs.com/a.jpg", supabaseURL: base) == nil)
        #expect(PhotoURL.canonical(path: "uid/x y.jpg", supabaseURL: base) == "\(base)/storage/v1/object/public/photos/uid/x%20y.jpg")
    }

    @Test func testSanitize() {
        #expect(PhotoURL.sanitizeBase("IMG 0001 (1).heic") == "IMG-0001-1")
        #expect(PhotoURL.sanitizeBase("") == "photo")
        #expect(PhotoURL.sanitizeBase("../evil") == "photo") // 与 web 同：只剩点和斜杠 → 兜底
        #expect(PhotoURL.ext(forMime: "image/heic") == "heic")
        #expect(PhotoURL.ext(forMime: "application/pdf") == nil)
    }
}

@Suite struct ChatEventsTests {
    @Test func testAccumulatorAndDecode() {
        var acc = SSELineAccumulator()
        #expect(acc.consume(line: "data: {\"type\":\"meta\",\"conversation_id\":\"c1\",\"is_new\":true}") == nil)
        let payload = acc.consume(line: "")
        #expect(payload != nil)
        #expect(ChatEvent.decode(payload: payload!) == .meta(conversationId: "c1", isNew: true))
        #expect(acc.consume(line: ": ping") == nil)
        #expect(acc.consume(line: "data: {\"type\":\"text\",\"delta\":\"你好\"}") == nil)
        #expect(ChatEvent.decode(payload: acc.flush()!) == .text(delta: "你好"))
        #expect(ChatEvent.decode(payload: "{\"type\":\"tool_use_done\",\"id\":\"t\",\"name\":\"search_my_list\",\"input\":{\"cuisine\":[\"日料\"]}}") == .toolUseDone(id: "t", name: "search_my_list", input: ["cuisine": ["日料"]]))
        #expect(ChatEvent.decode(payload: "{\"type\":\"usage\",\"input_tokens\":10,\"output_tokens\":5}") == .usage(inputTokens: 10, outputTokens: 5))
        #expect(ChatEvent.decode(payload: "{\"type\":\"done\",\"reason\":\"end_turn\"}") == .done(reason: "end_turn"))
        #expect(ChatEvent.decode(payload: "{\"type\":\"error\"}") == .error(message: "AI 调用失败"))
        #expect(ChatEvent.decode(payload: "nope") == nil)
    }
}

@Suite struct ThemeTests {
    @Test func testAllTokensAreValidHex() {
        for theme in BiteTheme.allCases {
            for dark in [false, true] {
                let t = ThemeTokens.tokens(for: theme, dark: dark)
                for hex in t.allColors {
                    #expect(HexColor.rgb(hex) != nil, "\(theme) dark=\(dark) bad hex \(hex)")
                }
                #expect(t.isDark == theme.forcesDark || dark)
            }
            #expect(theme.dots.count == 3)
        }
    }
}

@Suite struct ModelsDecodingTests {
    @Test func testPlaceDecodesWithMissingArraysAndUnknownEnums() throws {
        let json = """
        {"id":"p1","list_id":"l1","name":"MOri’s","address":"Irvine","status":"weird","source":"tiktok",
         "price_range":"$$","reasons":[{"user_id":"u","text":"好吃"},{"bogus":1}],"lat":"33.1","photo_urls":null,
         "google_rating":4.3,"google_rating_count":816}
        """
        let p = try JSONDecoder().decode(Place.self, from: Data(json.utf8))
        #expect(p.status == .wantToGo)
        #expect(p.source == .manual)
        #expect(p.priceRange == .two)
        #expect(p.cuisine == [])
        #expect(p.photoUrls == [])
        #expect(p.reasons.count == 2)
        #expect(p.myReason(for: "u")?.text == "好吃")
        #expect(p.lat == nil) // 字符串坐标当成没有，不崩
        #expect(p.googleRatingCount == 816)
    }

    @Test func testContentBlockRoundTrip() throws {
        let blocks: [LlmContentBlock] = [
            .text("hi"),
            .toolUse(id: "1", name: "search_my_list", input: ["status": ["want_to_go"]]),
            .toolResult(toolUseId: "1", content: "{\"count\":1}", isError: false),
        ]
        let data = try JSONEncoder().encode(blocks)
        let back = try JSONDecoder().decode([LlmContentBlock].self, from: data)
        #expect(back == blocks)
        let obj = try JSONSerialization.jsonObject(with: data) as! [[String: Any]]
        #expect(obj[1]["type"] as? String == "tool_use")
        #expect(obj[2]["tool_use_id"] as? String == "1")
    }

    @Test func testBiteJSONExplicitNull() throws {
        let payload: [String: BiteJSON] = ["notes": .from(nil as String?), "star": .from(4), "tags": .strings(["a"])]
        let s = String(data: try JSONEncoder().encode(payload), encoding: .utf8)!
        #expect(s.contains("\"notes\":null"))
        #expect(s.contains("\"star\":4"))
    }

    @Test func testExtractedPlacePhotoPick() {
        let p = ExtractedPlace(name: "上水小馆", address: "尔湾", cuisine: ["粤菜"], photoIndices: [0, 1, 9])
        #expect(p.pickPhotos(from: ["a", "b", "c"]) == ["a", "b"])
        let q = ExtractedPlace(name: "（未知）", address: "", cuisine: [])
        #expect(q.isUnknownName)
        #expect(q.pickPhotos(from: ["a"]) == ["a"])
    }
}
