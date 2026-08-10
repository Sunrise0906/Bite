import { describe, it, expect } from "vitest";
import {
  isPlaceDomain,
  vocabFor,
  domainFocusPrompt,
  DOMAIN_VOCAB,
} from "./domain";

describe("isPlaceDomain", () => {
  it("四个合法领域", () => {
    for (const d of ["food", "drink", "activity", "other"]) {
      expect(isPlaceDomain(d)).toBe(true);
    }
  });

  it("非法值一律 false（DB 里 category 是 text，可能是任何东西）", () => {
    for (const v of ["", "FOOD", "餐厅", null, undefined, 0, {}]) {
      expect(isPlaceDomain(v)).toBe(false);
    }
  });
});

describe("vocabFor", () => {
  it("玩乐用「类型 / 花费 / 亮点」，不是「菜系 / 人均 / 招牌菜」", () => {
    const v = vocabFor("activity");
    expect(v.typeLabel).toBe("类型");
    expect(v.highlightLabel).toBe("亮点");
    expect(v.typeLabel).not.toBe("菜系");
  });

  it("吃仍然是菜系 / 招牌菜（不能把老行为改掉）", () => {
    const v = vocabFor("food");
    expect(v.typeLabel).toBe("菜系");
    expect(v.highlightLabel).toBe("招牌菜");
  });

  it("喝是品类", () => {
    expect(vocabFor("drink").typeLabel).toBe("品类");
  });

  it("null / undefined / 脏值都回落到 food —— 保持既有行为", () => {
    expect(vocabFor(null).typeLabel).toBe("菜系");
    expect(vocabFor(undefined).typeLabel).toBe("菜系");
    // @ts-expect-error 故意传脏值，模拟 DB 里存了别的字符串
    expect(vocabFor("餐厅").typeLabel).toBe("菜系");
  });

  it("每个领域的类型候选都非空（喂给 LLM 当取值范围）", () => {
    for (const d of ["food", "drink", "activity", "other"] as const) {
      expect(DOMAIN_VOCAB[d].typeExamples.length).toBeGreaterThan(0);
    }
  });
});

describe("domainFocusPrompt", () => {
  it("玩乐的聚焦段带上展览/徒步这类词，不带菜系词", () => {
    const p = domainFocusPrompt("activity");
    expect(p).toContain("展览");
    expect(p).toContain("类型");
    expect(p).not.toContain("川菜");
  });

  it("吃的聚焦段带菜系词", () => {
    const p = domainFocusPrompt("food");
    expect(p).toContain("菜系");
    expect(p).toContain("川菜");
  });

  it("明确允许「内容不属于这个领域时照实抽」——避免硬凑", () => {
    expect(domainFocusPrompt("activity")).toContain("不要硬凑");
  });

  it("四个领域都能生成非空聚焦段", () => {
    for (const d of ["food", "drink", "activity", "other"] as const) {
      expect(domainFocusPrompt(d).length).toBeGreaterThan(40);
    }
  });
});
