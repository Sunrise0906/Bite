import { describe, it, expect } from "vitest";
import { normalizeName, sameName, indexByName } from "./name-key";

describe("normalizeName", () => {
  it("弯撇号和直撇号视为同一家 —— 这就是 MOri’s 那条重复记录的成因", () => {
    // 库里手写的是 U+2019（iOS 智能标点），小红书/LLM 给的是 ASCII '
    expect(sameName("MOri’s", "MOri's")).toBe(true);
  });

  it("大小写不敏感（LLM 爱把 MOri's 规整成 Mori's）", () => {
    expect(sameName("MOri's", "Mori's")).toBe(true);
  });

  it("全角字符归一（NFKC）", () => {
    expect(sameName("ＭＯｒｉ", "MOri")).toBe(true);
  });

  it("折叠内部连续空白 + 去首尾", () => {
    expect(sameName("  Yuk   Dae Jang ", "Yuk Dae Jang")).toBe(true);
  });

  it("全角空格也算空白", () => {
    expect(sameName("老　码头", "老 码头")).toBe(true);
  });

  it("不做模糊匹配：加了后缀就是另一家", () => {
    // 「海底捞」和「海底捞火锅」是不是同一家，是人的判断，不该由归一化替用户决定
    expect(sameName("海底捞", "海底捞火锅")).toBe(false);
  });

  it("不吃掉标点：A&B 与 AB 不是同一家", () => {
    expect(sameName("A&B Cafe", "AB Cafe")).toBe(false);
  });

  it("中文不受小写影响", () => {
    expect(normalizeName("凯悦轩")).toBe("凯悦轩");
  });

  it("空串不炸", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
  });
});

describe("indexByName", () => {
  it("按归一化 key 命中", () => {
    const m = indexByName([{ id: "1", name: "MOri’s" }]);
    expect(m.get(normalizeName("mori's"))?.id).toBe("1");
  });

  it("库里已有的重复行：稳定取先出现的那条，不做破坏性合并", () => {
    // 调用方按 created_at 升序传入 → 永远落在最早那条上
    const m = indexByName([
      { id: "old", name: "MOri’s" },
      { id: "new", name: "Mori's" },
    ]);
    expect(m.size).toBe(1);
    expect(m.get(normalizeName("MORI'S"))?.id).toBe("old");
  });

  it("空数组给空 Map", () => {
    expect(indexByName([]).size).toBe(0);
  });
});
