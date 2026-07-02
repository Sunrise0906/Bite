import { describe, expect, it } from "vitest";
import { shouldMirrorPhotoUrl, extForContentType } from "./mirror-photos";

describe("shouldMirrorPhotoUrl", () => {
  it("XHS CDN 域命中（含子域）", () => {
    expect(shouldMirrorPhotoUrl("https://sns-webpic-qc.xhscdn.com/abc")).toBe(true);
    expect(shouldMirrorPhotoUrl("http://ci.xiaohongshu.com/x.jpg")).toBe(true);
    expect(shouldMirrorPhotoUrl("https://xhscdn.com/x")).toBe(true);
  });

  it("其他域不转存（用户有意贴的图床 / 自家 storage）", () => {
    expect(shouldMirrorPhotoUrl("https://i.imgur.com/x.png")).toBe(false);
    expect(
      shouldMirrorPhotoUrl("https://abc.supabase.co/storage/v1/object/public/photos/u/a.png"),
    ).toBe(false);
    // 后缀伪装域不命中
    expect(shouldMirrorPhotoUrl("https://evilxhscdn.com/x")).toBe(false);
    expect(shouldMirrorPhotoUrl("https://xhscdn.com.evil.com/x")).toBe(false);
  });

  it("非法/非 http URL 返回 false", () => {
    expect(shouldMirrorPhotoUrl("not-a-url")).toBe(false);
    expect(shouldMirrorPhotoUrl("ftp://xhscdn.com/x")).toBe(false);
    expect(shouldMirrorPhotoUrl("")).toBe(false);
  });
});

describe("extForContentType", () => {
  it("常见图片 MIME 映射", () => {
    expect(extForContentType("image/jpeg")).toBe("jpg");
    expect(extForContentType("image/webp")).toBe("webp");
    expect(extForContentType("image/png; charset=binary")).toBe("png");
    expect(extForContentType("IMAGE/JPEG")).toBe("jpg");
  });

  it("非图/未知类型返回 null", () => {
    expect(extForContentType("text/html")).toBeNull();
    expect(extForContentType("image/svg+xml")).toBeNull();
    expect(extForContentType(null)).toBeNull();
  });
});
