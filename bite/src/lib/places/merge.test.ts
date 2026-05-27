import { describe, it, expect } from "vitest";
import {
  unionStrings,
  mergeReasons,
  appendReasonDedup,
  pickPhotosByIndices,
} from "./merge";

describe("unionStrings", () => {
  it("保序合并：existing 在前，只追加 incoming 里的新值", () => {
    expect(unionStrings(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("incoming 内部也去重", () => {
    expect(unionStrings([], ["x", "x", "y"])).toEqual(["x", "y"]);
  });

  it("existing 不是数组时按空处理", () => {
    expect(unionStrings(null, ["a"])).toEqual(["a"]);
    expect(unionStrings(undefined, ["a"])).toEqual(["a"]);
    expect(unionStrings("不是数组", ["a"])).toEqual(["a"]);
  });

  it("过滤掉 existing 里的非字符串脏值（DB JSON 可能不干净）", () => {
    expect(unionStrings(["a", 1, null, "b"], ["c"])).toEqual(["a", "b", "c"]);
  });

  it("incoming 为空时原样返回 existing 的副本", () => {
    const existing = ["a", "b"];
    const out = unionStrings(existing, []);
    expect(out).toEqual(["a", "b"]);
    expect(out).not.toBe(existing); // 新数组，不是同一引用
  });
});

describe("mergeReasons", () => {
  const me = "user-1";
  const other = { user_id: "user-2", text: "朋友的理由" };

  it("override=true：替换我的 reason，保留别人的", () => {
    const existing = [other, { user_id: me, text: "旧的" }];
    expect(mergeReasons(existing, me, "新的", true)).toEqual([
      other,
      { user_id: me, text: "新的" },
    ]);
  });

  it("override=true 且 newReason 为空：删掉我的 reason，别人的保留", () => {
    const existing = [other, { user_id: me, text: "旧的" }];
    expect(mergeReasons(existing, me, null, true)).toEqual([other]);
  });

  it("override=false 且我还没 reason：追加", () => {
    expect(mergeReasons([other], me, "想去", false)).toEqual([
      other,
      { user_id: me, text: "想去" },
    ]);
  });

  it("override=false 且我已有 reason：原样不动，不覆盖", () => {
    const existing = [other, { user_id: me, text: "我早写过" }];
    expect(mergeReasons(existing, me, "AI 想替我写", false)).toEqual(existing);
  });

  it("override=false 且 newReason 为空：不动现有，别人的保留", () => {
    expect(mergeReasons([other], me, null, false)).toEqual([other]);
  });

  it("existing 非数组或含脏值时安全降级", () => {
    expect(mergeReasons(null, me, "x", true)).toEqual([
      { user_id: me, text: "x" },
    ]);
    expect(
      mergeReasons([{ user_id: 1, text: 2 }, other], me, "x", true),
    ).toEqual([other, { user_id: me, text: "x" }]);
  });
});

describe("appendReasonDedup", () => {
  const r1 = { user_id: "u1", text: "好吃" };

  it("追加新 reason", () => {
    expect(appendReasonDedup([r1], { user_id: "u2", text: "也想去" })).toEqual([
      r1,
      { user_id: "u2", text: "也想去" },
    ]);
  });

  it("(user_id, text) 完全相同则不重复追加（防重复点接受）", () => {
    expect(appendReasonDedup([r1], { user_id: "u1", text: "好吃" })).toEqual([
      r1,
    ]);
  });

  it("同 user 不同 text 视为新的，追加", () => {
    expect(appendReasonDedup([r1], { user_id: "u1", text: "换个理由" })).toEqual(
      [r1, { user_id: "u1", text: "换个理由" }],
    );
  });

  it("newReason 为 null：原样返回", () => {
    expect(appendReasonDedup([r1], null)).toEqual([r1]);
  });

  it("existing 非数组按空处理", () => {
    expect(appendReasonDedup(null, r1)).toEqual([r1]);
  });
});

describe("pickPhotosByIndices", () => {
  const photos = ["p0", "p1", "p2", "p3"];

  it("按索引挑出对应图（保持索引顺序）", () => {
    expect(pickPhotosByIndices([2, 0], photos)).toEqual(["p2", "p0"]);
  });

  it("过滤越界索引", () => {
    expect(pickPhotosByIndices([0, 9, 3], photos)).toEqual(["p0", "p3"]);
  });

  it("过滤非整数索引", () => {
    expect(pickPhotosByIndices([1.5, 2, -1], photos)).toEqual(["p2"]);
  });

  it("没标 indices（undefined）→ 回退全部图", () => {
    expect(pickPhotosByIndices(undefined, photos)).toEqual(photos);
  });

  it("标了空数组 → 回退全部图", () => {
    expect(pickPhotosByIndices([], photos)).toEqual(photos);
  });

  it("图集本身为空 → 返回空", () => {
    expect(pickPhotosByIndices([0, 1], [])).toEqual([]);
  });

  it("索引全无效 → 回退全部图（宁可多给让用户删）", () => {
    expect(pickPhotosByIndices([9, 10], photos)).toEqual(photos);
  });

  it("回退时返回副本，不是原数组引用", () => {
    const out = pickPhotosByIndices(undefined, photos);
    expect(out).toEqual(photos);
    expect(out).not.toBe(photos);
  });
});
