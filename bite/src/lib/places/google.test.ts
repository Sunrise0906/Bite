import { describe, it, expect } from "vitest";
import { inferCuisineFromTypes } from "./google";

describe("inferCuisineFromTypes", () => {
  it("基础单 type 映射", () => {
    expect(inferCuisineFromTypes("chinese_restaurant", [])).toEqual(["中餐"]);
    expect(inferCuisineFromTypes("japanese_restaurant", [])).toEqual(["日料"]);
    expect(inferCuisineFromTypes("korean_restaurant", [])).toEqual(["韩餐"]);
    expect(inferCuisineFromTypes("italian_restaurant", [])).toEqual(["意餐"]);
    expect(inferCuisineFromTypes("mexican_restaurant", [])).toEqual(["墨西哥菜"]);
    expect(inferCuisineFromTypes("thai_restaurant", [])).toEqual(["泰餐"]);
    expect(inferCuisineFromTypes("vietnamese_restaurant", [])).toEqual([
      "越南菜",
    ]);
    expect(inferCuisineFromTypes("indian_restaurant", [])).toEqual(["印度菜"]);
    expect(inferCuisineFromTypes("french_restaurant", [])).toEqual(["法餐"]);
    expect(inferCuisineFromTypes("american_restaurant", [])).toEqual(["美式"]);
    expect(inferCuisineFromTypes("pizza_restaurant", [])).toEqual(["披萨"]);
    expect(inferCuisineFromTypes("hamburger_restaurant", [])).toEqual(["汉堡"]);
    expect(inferCuisineFromTypes("barbecue_restaurant", [])).toEqual(["烧烤"]);
    expect(inferCuisineFromTypes("seafood_restaurant", [])).toEqual(["海鲜"]);
    expect(inferCuisineFromTypes("steak_house", [])).toEqual(["牛排"]);
    expect(inferCuisineFromTypes("bakery", [])).toEqual(["烘焙"]);
  });

  it("ramen 推双 tag '日料' + '拉面'", () => {
    expect(inferCuisineFromTypes("ramen_restaurant", ["restaurant"])).toEqual([
      "日料",
      "拉面",
    ]);
  });

  it("sushi 推双 tag '日料' + '寿司'", () => {
    expect(inferCuisineFromTypes("sushi_restaurant", [])).toEqual([
      "日料",
      "寿司",
    ]);
  });

  it("cafe / coffee_shop 合并去重", () => {
    expect(inferCuisineFromTypes("cafe", ["coffee_shop"])).toEqual(["咖啡"]);
  });

  it("dessert 三 type 合并", () => {
    expect(
      inferCuisineFromTypes("dessert_restaurant", [
        "dessert_shop",
        "ice_cream_shop",
      ]),
    ).toEqual(["甜品"]);
  });

  it("bar / pub 合并", () => {
    expect(inferCuisineFromTypes("bar", ["pub"])).toEqual(["酒吧"]);
  });

  it("vegan / vegetarian 合并", () => {
    expect(
      inferCuisineFromTypes("vegan_restaurant", ["vegetarian_restaurant"]),
    ).toEqual(["素食"]);
  });

  it("兜底命中：只 restaurant → '餐厅'", () => {
    expect(inferCuisineFromTypes("restaurant", [])).toEqual(["餐厅"]);
    expect(inferCuisineFromTypes(null, ["restaurant"])).toEqual(["餐厅"]);
  });

  it("兜底不命中：命中型 type 不追加 '餐厅'", () => {
    expect(inferCuisineFromTypes(null, ["cafe"])).toEqual(["咖啡"]);
  });

  it("多 type 去重：japanese + ramen + restaurant", () => {
    expect(
      inferCuisineFromTypes("japanese_restaurant", [
        "ramen_restaurant",
        "restaurant",
      ]),
    ).toEqual(["日料", "拉面"]);
  });

  it("完全未知 type → []", () => {
    expect(inferCuisineFromTypes("gas_station", ["store"])).toEqual([]);
  });

  it("空输入 → []", () => {
    expect(inferCuisineFromTypes(null, [])).toEqual([]);
  });

  it("primaryType=null 过滤后不进 switch（无副作用）", () => {
    expect(inferCuisineFromTypes(null, ["chinese_restaurant"])).toEqual([
      "中餐",
    ]);
  });
});
