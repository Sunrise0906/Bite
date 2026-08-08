import { describe, it, expect } from "vitest";
import { parseTags, parseStatus, parsePrice } from "./parse-form";

describe("parseTags", () => {
  it("英文逗号分隔", () => {
    expect(parseTags("川菜,火锅")).toEqual(["川菜", "火锅"]);
  });

  it("中文逗号 / 顿号 / 空白都算分隔符（小红书粘贴过来三种都有）", () => {
    expect(parseTags("川菜，火锅、烧烤 日料")).toEqual([
      "川菜",
      "火锅",
      "烧烤",
      "日料",
    ]);
  });

  it("连续分隔符不产生空标签", () => {
    expect(parseTags("川菜,,，、  火锅")).toEqual(["川菜", "火锅"]);
  });

  it("首尾分隔符不产生空标签", () => {
    expect(parseTags(" ,川菜, ")).toEqual(["川菜"]);
  });

  it("空串 → 空数组", () => {
    expect(parseTags("")).toEqual([]);
  });

  it("非字符串（File / null）→ 空数组，不抛", () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(new File([], "x.png") as unknown as FormDataEntryValue)).toEqual([]);
  });
});

describe("parseStatus", () => {
  it("三个合法值原样返回", () => {
    expect(parseStatus("want_to_go")).toBe("want_to_go");
    expect(parseStatus("visited")).toBe("visited");
    expect(parseStatus("archived")).toBe("archived");
  });

  it("非法值回落 want_to_go", () => {
    expect(parseStatus("deleted")).toBe("want_to_go");
    expect(parseStatus("")).toBe("want_to_go");
  });

  it("null 回落 want_to_go", () => {
    expect(parseStatus(null)).toBe("want_to_go");
  });
});

describe("parsePrice", () => {
  it("四个合法档位原样返回", () => {
    expect(parsePrice("$")).toBe("$");
    expect(parsePrice("$$")).toBe("$$");
    expect(parsePrice("$$$")).toBe("$$$");
    expect(parsePrice("$$$$")).toBe("$$$$");
  });

  it("空串 → null（价位是选填，不要瞎猜）", () => {
    expect(parsePrice("")).toBeNull();
  });

  it("非法值 → null", () => {
    expect(parsePrice("$$$$$")).toBeNull();
    expect(parsePrice("cheap")).toBeNull();
  });

  it("null → null", () => {
    expect(parsePrice(null)).toBeNull();
  });
});
