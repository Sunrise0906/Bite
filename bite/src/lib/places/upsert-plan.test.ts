import { describe, it, expect } from "vitest";
import {
  buildUpsertPlan,
  googleFieldsFor,
  type UpsertCandidate,
  type ExistingPlaceRow,
} from "./upsert-plan";

const ME = "user-me";
const FRIEND = "user-friend";

function candidate(over: Partial<UpsertCandidate> = {}): UpsertCandidate {
  return {
    list_id: "list-1",
    name: "海底捞",
    address: "Irvine, CA",
    cuisine: ["火锅"],
    price_range: "$$",
    status: "want_to_go",
    occasions: [],
    tags: [],
    recommended_by: null,
    myReason: null,
    notes: null,
    dishes: [],
    photo_urls: [],
    source: "ai_extract",
    source_url: null,
    google_place_id: null,
    google_rating: null,
    google_rating_count: null,
    google_maps_uri: null,
    website_uri: null,
    lat: null,
    lng: null,
    ...over,
  };
}

function existing(over: Partial<ExistingPlaceRow> = {}): ExistingPlaceRow {
  return {
    id: "place-1",
    name: "海底捞",
    reasons: [],
    notes: null,
    photo_urls: [],
    cuisine: [],
    tags: [],
    occasions: [],
    dishes: [],
    ...over,
  };
}

const NONE = new Map<string, ExistingPlaceRow>();
const opts = { overrideMyReason: false };

describe("buildUpsertPlan — 分流", () => {
  it("库里没有同名 → insert", () => {
    const [step] = buildUpsertPlan([candidate()], NONE, ME, opts);
    expect(step.kind).toBe("insert");
  });

  it("库里有同名 → update，并带上那一行的 id", () => {
    const map = new Map([["海底捞", existing({ id: "place-42" })]]);
    const [step] = buildUpsertPlan([candidate()], map, ME, opts);
    expect(step.kind).toBe("update");
    if (step.kind === "update") expect(step.id).toBe("place-42");
  });

  it("空候选 → 空计划", () => {
    expect(buildUpsertPlan([], NONE, ME, opts)).toEqual([]);
  });

  it("多个候选各自独立分流", () => {
    const map = new Map([["海底捞", existing()]]);
    const steps = buildUpsertPlan(
      [candidate(), candidate({ name: "小肥羊" })],
      map,
      ME,
      opts,
    );
    expect(steps.map((s) => s.kind)).toEqual(["update", "insert"]);
  });
});

describe("buildUpsertPlan — Google 口碑字段（此前会被 null 静默清空）", () => {
  it("有 place_id 但 rating 为 null → 不写 rating（保住库里既有评分）", () => {
    const map = new Map([["海底捞", existing()]]);
    const [step] = buildUpsertPlan(
      [candidate({ google_place_id: "gp-1", google_rating: null })],
      map,
      ME,
      opts,
    );
    if (step.kind !== "update") throw new Error("应为 update");
    expect(step.fields.google_place_id).toBe("gp-1");
    expect(step.fields).not.toHaveProperty("google_rating");
    expect(step.fields).not.toHaveProperty("google_rating_count");
    expect(step.fields).not.toHaveProperty("google_maps_uri");
  });

  it("拿到了评分 → 正常写入", () => {
    const map = new Map([["海底捞", existing()]]);
    const [step] = buildUpsertPlan(
      [
        candidate({
          google_place_id: "gp-1",
          google_rating: 4.3,
          google_rating_count: 1200,
          google_maps_uri: "https://maps.google.com/x",
        }),
      ],
      map,
      ME,
      opts,
    );
    if (step.kind !== "update") throw new Error("应为 update");
    expect(step.fields.google_rating).toBe(4.3);
    expect(step.fields.google_rating_count).toBe(1200);
  });

  it("没有 place_id → 一个 Google 字段都不写", () => {
    expect(googleFieldsFor(candidate())).toEqual({});
  });

  it("坐标必须成对才写", () => {
    expect(
      googleFieldsFor(candidate({ google_place_id: "g", lat: 33.6, lng: null })),
    ).not.toHaveProperty("lat");
    expect(
      googleFieldsFor(candidate({ google_place_id: "g", lat: 33.6, lng: -117.8 })),
    ).toMatchObject({ lat: 33.6, lng: -117.8 });
  });

  it("rating 为 0 也算「拿到了」，不能被判空吃掉", () => {
    const f = googleFieldsFor(
      candidate({ google_place_id: "g", google_rating: 0, google_rating_count: 0 }),
    );
    expect(f.google_rating).toBe(0);
    expect(f.google_rating_count).toBe(0);
  });
});

describe("buildUpsertPlan — notes 归属", () => {
  it("已有非空 notes（多半是用户手编的）→ 保留，不被 AI 生成的覆盖", () => {
    const map = new Map([["海底捞", existing({ notes: "我自己写的备注" })]]);
    const [step] = buildUpsertPlan(
      [candidate({ notes: "AI 新生成的" })],
      map,
      ME,
      opts,
    );
    if (step.kind !== "update") throw new Error("应为 update");
    expect(step.fields.notes).toBe("我自己写的备注");
  });

  it("已有 notes 是纯空白 → 视为空，用新的", () => {
    const map = new Map([["海底捞", existing({ notes: "   " })]]);
    const [step] = buildUpsertPlan([candidate({ notes: "AI" })], map, ME, opts);
    if (step.kind !== "update") throw new Error("应为 update");
    expect(step.fields.notes).toBe("AI");
  });
});

describe("buildUpsertPlan — reasons 只动自己那条", () => {
  it("朋友写的理由原样保留，自己的追加", () => {
    const map = new Map([
      [
        "海底捞",
        existing({
          reasons: [{ user_id: FRIEND, text: "朋友说好吃" }],
        }),
      ],
    ]);
    const [step] = buildUpsertPlan(
      [candidate({ myReason: "我想试试" })],
      map,
      ME,
      opts,
    );
    if (step.kind !== "update") throw new Error("应为 update");
    expect(step.fields.reasons).toEqual([
      { user_id: FRIEND, text: "朋友说好吃" },
      { user_id: ME, text: "我想试试" },
    ]);
  });
});

describe("buildUpsertPlan — 数组字段 union 去重", () => {
  it("既有的不丢，新的并进来，重复项只留一份", () => {
    const map = new Map([
      [
        "海底捞",
        existing({ cuisine: ["火锅"], dishes: ["虾滑"], tags: ["排队长"] }),
      ],
    ]);
    const [step] = buildUpsertPlan(
      [candidate({ cuisine: ["火锅", "川菜"], dishes: ["毛肚"], tags: [] })],
      map,
      ME,
      opts,
    );
    if (step.kind !== "update") throw new Error("应为 update");
    expect(step.fields.cuisine).toEqual(["火锅", "川菜"]);
    expect(step.fields.dishes).toEqual(["虾滑", "毛肚"]);
    expect(step.fields.tags).toEqual(["排队长"]);
  });

  it("DB 返回脏数据（null / 非数组）不炸", () => {
    const map = new Map([
      [
        "海底捞",
        existing({ cuisine: null, tags: "不是数组", photo_urls: undefined }),
      ],
    ]);
    const [step] = buildUpsertPlan(
      [candidate({ cuisine: ["火锅"] })],
      map,
      ME,
      opts,
    );
    if (step.kind !== "update") throw new Error("应为 update");
    expect(step.fields.cuisine).toEqual(["火锅"]);
  });
});

describe("buildUpsertPlan — insert 分支", () => {
  it("created_by 用当前用户；客观字段原样带上", () => {
    const [step] = buildUpsertPlan(
      [candidate({ myReason: "解馋", google_rating: 4.1 })],
      NONE,
      ME,
      opts,
    );
    if (step.kind !== "insert") throw new Error("应为 insert");
    expect(step.row.created_by).toBe(ME);
    expect(step.row.list_id).toBe("list-1");
    expect(step.row.reasons).toEqual([{ user_id: ME, text: "解馋" }]);
    // insert 是全新行，没有既有数据可被覆盖，所以 null 照写不误
    expect(step.row.google_rating).toBe(4.1);
  });

  it("没写理由 → reasons 为空数组，而不是塞一条空文本", () => {
    const [step] = buildUpsertPlan([candidate()], NONE, ME, opts);
    if (step.kind !== "insert") throw new Error("应为 insert");
    expect(step.row.reasons).toEqual([]);
  });
});
