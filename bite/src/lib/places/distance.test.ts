import { describe, it, expect } from "vitest";
import {
  distanceMiles,
  formatDistance,
  sortByDistance,
  boundsFor,
  nearbyPoints,
  IRVINE_FALLBACK,
} from "./distance";

describe("distanceMiles", () => {
  it("同一点距离为 0", () => {
    expect(distanceMiles(IRVINE_FALLBACK, IRVINE_FALLBACK)).toBe(0);
  });

  it("尔湾 → 洛杉矶市中心约 35 mi", () => {
    // ⚠️ 这是**直线距离**（great-circle），不是驾车距离。
    // Google Maps 显示的 ~40 mi 是走 405/5 的路程 —— 别拿那个数来「修」这里的公式。
    // 我们要的就是直线：用于「哪家更近」的相对排序，不是给导航用的。
    const la = { lat: 34.0522, lng: -118.2437 };
    const d = distanceMiles(IRVINE_FALLBACK, la);
    expect(d).toBeGreaterThan(30);
    expect(d).toBeLessThan(40);
  });

  it("对称：A→B 等于 B→A", () => {
    const a = { lat: 33.68, lng: -117.82 };
    const b = { lat: 33.75, lng: -117.9 };
    expect(distanceMiles(a, b)).toBeCloseTo(distanceMiles(b, a), 10);
  });

  it("跨经度 180 度不炸（asin 入参被 clamp）", () => {
    const d = distanceMiles({ lat: 0, lng: -179.9 }, { lat: 0, lng: 179.9 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeLessThan(30); // 走的是短弧，不是绕地球一圈
  });

  it("对跖点约等于半个赤道周长", () => {
    const d = distanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(d).toBeGreaterThan(12000);
    expect(d).toBeLessThan(12500);
  });
});

describe("formatDistance", () => {
  it("极近给「就在附近」，不给 0.0 mi", () => {
    expect(formatDistance(0.02)).toBe("就在附近");
  });

  it("10 mi 内给一位小数（0.3 和 0.8 是不同的决策）", () => {
    expect(formatDistance(0.34)).toBe("0.3 mi");
    expect(formatDistance(2.75)).toBe("2.8 mi");
  });

  it("10 mi 以上取整（那个小数位对决策没意义）", () => {
    expect(formatDistance(12.4)).toBe("12 mi");
    expect(formatDistance(41.6)).toBe("42 mi");
  });

  it("脏值返回空串，不显示 NaN mi", () => {
    expect(formatDistance(NaN)).toBe("");
    expect(formatDistance(-5)).toBe("");
    expect(formatDistance(Infinity)).toBe("");
  });
});

describe("sortByDistance", () => {
  const origin = IRVINE_FALLBACK;
  const near = { id: "near", lat: 33.69, lng: -117.83 };
  const far = { id: "far", lat: 34.05, lng: -118.24 };
  const noCoord = { id: "none", lat: null, lng: null };

  it("按距离升序", () => {
    const out = sortByDistance([far, near], origin);
    expect(out.map((o) => o.id)).toEqual(["near", "far"]);
  });

  it("没有坐标的沉底，而不是当成距离 0 冒到最前", () => {
    const out = sortByDistance([noCoord, far, near], origin);
    expect(out.map((o) => o.id)).toEqual(["near", "far", "none"]);
    expect(out[2].distanceMi).toBeNull();
  });

  it("带上 distanceMi 供展示", () => {
    const out = sortByDistance([near], origin);
    expect(typeof out[0].distanceMi).toBe("number");
    expect(out[0].distanceMi!).toBeLessThan(2);
  });

  it("不改入参数组", () => {
    const input = [far, near];
    const copy = [...input];
    sortByDistance(input, origin);
    expect(input).toEqual(copy);
  });

  it("空数组不炸", () => {
    expect(sortByDistance([], origin)).toEqual([]);
  });

  it("全都没坐标时保持稳定不报错", () => {
    const out = sortByDistance([noCoord, { ...noCoord, id: "b" }], origin);
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.distanceMi === null)).toBe(true);
  });
});

describe("nearbyPoints", () => {
  const p = (id: string, distanceMi: number | null) => ({
    id,
    lat: 33.68 + (distanceMi ?? 0) / 69,
    lng: -117.82,
    distanceMi,
  });

  it("把坐标错到地球另一边的那家踢出取景框", () => {
    // 真实事故：一家店的 place_id / 评分都是 Westminster CA，坐标却在越南。
    // 全量 fitBounds 会因此把视野撑成整个地球 —— 整张图作废。
    const items = [p("a", 0.4), p("b", 1.2), p("c", 3), p("d", 6), p("e", 9), p("越南", 8200)];
    const out = nearbyPoints(items);
    expect(out).toHaveLength(5);
    expect(out.every((o) => o.lat < 34)).toBe(true);
  });

  it("半径内不足 minCount 家时退回「最近的几家」，不给空框", () => {
    const items = [p("a", 40), p("b", 60), p("c", 90)];
    const out = nearbyPoints(items, 25, 5);
    expect(out).toHaveLength(3); // 有几家给几家
  });

  it("没有坐标的不进取景框", () => {
    const out = nearbyPoints([
      { lat: null, lng: null, distanceMi: null },
      p("a", 1),
    ]);
    expect(out).toHaveLength(1);
  });

  it("空数组返回空", () => {
    expect(nearbyPoints([])).toEqual([]);
  });
});

describe("boundsFor", () => {
  it("空数组返回 null（调用方据此跳过 fitBounds）", () => {
    expect(boundsFor([])).toBeNull();
  });

  it("多点时框住所有点", () => {
    const b = boundsFor([
      { lat: 33.6, lng: -117.9 },
      { lat: 34.0, lng: -117.7 },
    ])!;
    expect(b.sw.lat).toBeCloseTo(33.6);
    expect(b.ne.lat).toBeCloseTo(34.0);
    expect(b.sw.lng).toBeCloseTo(-117.9);
    expect(b.ne.lng).toBeCloseTo(-117.7);
  });

  it("单点会撑开一点 —— 否则 fitBounds 缩到最大级别，看着像坏了", () => {
    const b = boundsFor([IRVINE_FALLBACK])!;
    expect(b.ne.lat).toBeGreaterThan(b.sw.lat);
    expect(b.ne.lng).toBeGreaterThan(b.sw.lng);
  });

  it("多点但全部重合，同样撑开", () => {
    const p = { lat: 33.68, lng: -117.82 };
    const b = boundsFor([p, p, p])!;
    expect(b.ne.lat).toBeGreaterThan(b.sw.lat);
  });
});
