import { describe, it, expect } from "vitest";
import {
  normalize,
  parseSentiment,
  parseStar,
  parseVisitedAt,
} from "./parse";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("normalize", () => {
  it("null / 非字符串 → null", () => {
    expect(normalize(null)).toBeNull();
    expect(normalize(new File([], "x"))).toBeNull();
  });
  it("空 / 纯空格 → null", () => {
    expect(normalize("")).toBeNull();
    expect(normalize("   ")).toBeNull();
  });
  it("trim 前后空白", () => {
    expect(normalize("  abc  ")).toBe("abc");
    expect(normalize("abc")).toBe("abc");
  });
});

describe("parseStar", () => {
  it("空 / 缺失 → null（允许不填）", () => {
    expect(parseStar(fd({}))).toEqual({ ok: true, value: null });
    expect(parseStar(fd({ star_rating: "" }))).toEqual({ ok: true, value: null });
    expect(parseStar(fd({ star_rating: "   " }))).toEqual({
      ok: true,
      value: null,
    });
  });
  it("1 / 5 合法", () => {
    expect(parseStar(fd({ star_rating: "1" }))).toEqual({ ok: true, value: 1 });
    expect(parseStar(fd({ star_rating: "5" }))).toEqual({ ok: true, value: 5 });
  });
  it("0 / 6 越界", () => {
    expect(parseStar(fd({ star_rating: "0" }))).toEqual({
      ok: false,
      error: "星级要在 1-5 之间",
    });
    expect(parseStar(fd({ star_rating: "6" }))).toEqual({
      ok: false,
      error: "星级要在 1-5 之间",
    });
  });
  it("浮点拒绝", () => {
    expect(parseStar(fd({ star_rating: "3.5" })).ok).toBe(false);
  });
});

describe("parseSentiment", () => {
  it("三个合法值都通过", () => {
    expect(parseSentiment(fd({ sentiment: "will_return" }))).toEqual({
      ok: true,
      value: "will_return",
    });
    expect(parseSentiment(fd({ sentiment: "okay" }))).toEqual({
      ok: true,
      value: "okay",
    });
    expect(parseSentiment(fd({ sentiment: "wont_return" }))).toEqual({
      ok: true,
      value: "wont_return",
    });
  });
  it("未知值 / 空 / 缺失 → error", () => {
    expect(parseSentiment(fd({ sentiment: "great" })).ok).toBe(false);
    expect(parseSentiment(fd({ sentiment: "" })).ok).toBe(false);
    expect(parseSentiment(fd({})).ok).toBe(false);
  });
});

describe("parseVisitedAt", () => {
  it("非法日期串 → error", () => {
    const out = parseVisitedAt(fd({ visited_at: "not-a-date" }));
    expect(out).toEqual({ ok: false, error: "日期格式不对" });
  });

  it("缺失 / 空 / 空白 → 当前时间 ISO", () => {
    const before = Date.now();
    const out = parseVisitedAt(fd({}));
    const after = Date.now();
    expect(out.ok).toBe(true);
    if (out.ok) {
      const t = Date.parse(out.iso);
      expect(t).toBeGreaterThanOrEqual(before - 1);
      expect(t).toBeLessThanOrEqual(after + 1);
    }
  });

  it("合法 YYYY-MM-DD 保留日历日（T12:00:00 防 UTC 偏移）", () => {
    const out = parseVisitedAt(fd({ visited_at: "2026-05-29" }));
    expect(out.ok).toBe(true);
    if (out.ok) {
      const d = new Date(out.iso);
      // 关键：UTC 视角的日期仍是 29，因为 T12:00:00 留了 +/-12h 缓冲
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(4); // 0-indexed
      expect(d.getUTCDate()).toBe(29); // regression guard，不要去掉 T12:00:00
    }
  });
});
