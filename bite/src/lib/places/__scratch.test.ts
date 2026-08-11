import { describe, it, expect } from "vitest";
import { buildUpsertPlan, type UpsertCandidate, type ExistingPlaceRow } from "./upsert-plan";
import { normalizeName } from "./name-key";

const ME = "me";
const c = (o: Partial<UpsertCandidate> = {}): UpsertCandidate => ({
  list_id: "l1", name: "Mori's", address: "addr", cuisine: ["日料"],
  price_range: null, status: "want_to_go", occasions: [], tags: [],
  recommended_by: null, myReason: null, notes: null, dishes: [], photo_urls: [],
  source: "manual", source_url: null, google_place_id: null, google_rating: null,
  google_rating_count: null, google_maps_uri: null, website_uri: null, lat: null, lng: null, ...o,
});
const e = (o: Partial<ExistingPlaceRow> = {}): ExistingPlaceRow => ({
  id: "p1", name: "Mori's", reasons: [], notes: null, photo_urls: [], cuisine: [],
  tags: [], occasions: [], dishes: [], address: "old", price_range: null,
  status: "want_to_go", recommended_by: null, source_url: null, ...o,
});

describe("scratch", () => {
  it("archived + 用户明确选想去", () => {
    const m = new Map([[normalizeName("Mori's"), e({ status: "archived" })]]);
    const [s] = buildUpsertPlan([c({ status: "want_to_go" })], m, ME, { overrideMyReason: true });
    console.log("STATUS =", (s as any).fields.status);
    expect((s as any).fields.status).toBe("archived");
  });
  it("用户把价位改回未填", () => {
    const m = new Map([[normalizeName("Mori's"), e({ price_range: "$$", recommended_by: "同事" })]]);
    const [s] = buildUpsertPlan([c({ price_range: null, recommended_by: null })], m, ME, { overrideMyReason: true });
    console.log("PRICE =", (s as any).fields.price_range, "REC =", (s as any).fields.recommended_by);
    expect((s as any).fields.price_range).toBe("$$");
  });
  it("批内 insert：第二条无 google id 不丢第一条的 google 字段", () => {
    const steps = buildUpsertPlan(
      [c({ google_place_id: "X", google_rating: 4.5 }), c({ google_place_id: null })],
      new Map(), ME, { overrideMyReason: false });
    console.log("ROW =", JSON.stringify((steps[0] as any).row));
    expect(steps).toHaveLength(1);
  });
  it("批内 insert：两条不同 google id", () => {
    const steps = buildUpsertPlan(
      [c({ google_place_id: "X", google_rating: 4.5, google_rating_count: 100 }), c({ google_place_id: "Y", google_rating: null })],
      new Map(), ME, { overrideMyReason: false });
    console.log("ROW2 =", JSON.stringify((steps[0] as any).row));
  });
});
