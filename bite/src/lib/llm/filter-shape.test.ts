import { describe, it, expect } from "vitest";
import { normalizeFilterValues } from "./filter-shape";

describe("normalizeFilterValues", () => {
  it("undefined / null → []", () => {
    expect(normalizeFilterValues(undefined)).toEqual([]);
    expect(normalizeFilterValues(null)).toEqual([]);
  });

  it("空字符串 / 空数组 → []", () => {
    expect(normalizeFilterValues("")).toEqual([]);
    expect(normalizeFilterValues([])).toEqual([]);
    expect(normalizeFilterValues("   ")).toEqual([]);
  });

  it("单字符串 → 单元素数组", () => {
    expect(normalizeFilterValues("want_to_go")).toEqual(["want_to_go"]);
  });

  it("单字符串带空白 → trim 后单元素数组", () => {
    expect(normalizeFilterValues("  visited  ")).toEqual(["visited"]);
  });

  it("数组原样保留（顺序 + 去脏值）", () => {
    expect(normalizeFilterValues(["want_to_go", "visited"])).toEqual([
      "want_to_go",
      "visited",
    ]);
  });

  it("数组里夹杂 null / 空串 / 非字符串 → 过滤掉", () => {
    expect(
      normalizeFilterValues(["want_to_go", "", null, 42, undefined, "visited"]),
    ).toEqual(["want_to_go", "visited"]);
  });

  it("数组全脏 → []", () => {
    expect(normalizeFilterValues([null, "", "   ", undefined])).toEqual([]);
  });

  it("非数组非字符串（对象 / 数字）→ []", () => {
    expect(normalizeFilterValues(42)).toEqual([]);
    expect(normalizeFilterValues({ x: 1 })).toEqual([]);
    expect(normalizeFilterValues(true)).toEqual([]);
  });

  it("生产 bug 还原：status 数组不会被吞", () => {
    // 这是真实触发 bug 的入参形状
    expect(normalizeFilterValues(["want_to_go", "visited"])).toEqual([
      "want_to_go",
      "visited",
    ]);
  });
});
