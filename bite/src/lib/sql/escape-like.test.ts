import { describe, it, expect } from "vitest";
import { escapeLikePattern } from "./escape-like";

describe("escapeLikePattern", () => {
  it("普通字符串不动", () => {
    expect(escapeLikePattern("alice@example.com")).toBe("alice@example.com");
  });

  it("百分号被转义", () => {
    expect(escapeLikePattern("%@example.com")).toBe("\\%@example.com");
  });

  it("下划线被转义", () => {
    expect(escapeLikePattern("a_b@x.com")).toBe("a\\_b@x.com");
  });

  it("反斜杠先于其它元字符被转义（避免重复转义）", () => {
    expect(escapeLikePattern("a\\b@x.com")).toBe("a\\\\b@x.com");
  });

  it("多种元字符混合", () => {
    expect(escapeLikePattern("a%b_c\\d@x.com")).toBe("a\\%b\\_c\\\\d@x.com");
  });

  it("空字符串", () => {
    expect(escapeLikePattern("")).toBe("");
  });
});
