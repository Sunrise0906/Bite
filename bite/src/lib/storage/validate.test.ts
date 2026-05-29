import { describe, it, expect } from "vitest";
import {
  MAX_PHOTO_BYTES,
  extOf,
  sanitizeBase,
  validatePhotoFile,
} from "./validate";

describe("sanitizeBase", () => {
  it("空 / undefined-ish → 'photo'", () => {
    expect(sanitizeBase("")).toBe("photo");
    expect(sanitizeBase(".")).toBe("photo");
    expect(sanitizeBase("--")).toBe("photo");
  });

  it("剥掉扩展名后再 slug", () => {
    expect(sanitizeBase("foo.png")).toBe("foo");
    expect(sanitizeBase("hello.world.jpeg")).toBe("hello.world");
  });

  it("去掉路径分隔符", () => {
    expect(sanitizeBase("evil/path/cat.png")).toBe("evilpathcat");
    expect(sanitizeBase("a\\b\\c.jpg")).toBe("abc");
  });

  it("非白名单字符变 -，连续 - 收敛", () => {
    expect(sanitizeBase("中文 名字.jpg")).toBe("photo"); // 中文被替换后只剩 -
    expect(sanitizeBase("a b   c.png")).toBe("a-b-c");
    expect(sanitizeBase("hello!!world??.png")).toBe("hello-world");
  });

  it("超长截到 40 字", () => {
    const long = "x".repeat(120) + ".png";
    expect(sanitizeBase(long).length).toBe(40);
  });

  it("点和短横不会出现在首尾", () => {
    expect(sanitizeBase("...weird---.png")).toBe("weird");
  });
});

describe("extOf", () => {
  it("从文件名取（白名单内）", () => {
    expect(extOf("a.jpg", "image/jpeg")).toBe("jpg");
    expect(extOf("a.JPG", "image/jpeg")).toBe("jpg");
    expect(extOf("a.PNG", "image/png")).toBe("png");
    expect(extOf("a.webp", "image/webp")).toBe("webp");
    expect(extOf("a.heic", "image/heic")).toBe("heic");
  });

  it("文件名扩展不在白名单 → 用 MIME 兜底", () => {
    expect(extOf("a.bmp", "image/png")).toBe("png");
    expect(extOf("nofileext", "image/jpeg")).toBe("jpg");
  });

  it("MIME 也无法识别 → 空串", () => {
    expect(extOf("nofileext", "application/octet-stream")).toBe("");
    expect(extOf("a.bmp", "image/bmp")).toBe("");
  });
});

describe("validatePhotoFile", () => {
  it("缺文件 / size 不合法 → 错", () => {
    // @ts-expect-error 故意传 null 测健壮性
    expect(validatePhotoFile(null).ok).toBe(false);
    const r = validatePhotoFile({ size: 0, type: "image/png", name: "a.png" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("空");
  });

  it("超过 10MB → 错", () => {
    const r = validatePhotoFile({
      size: MAX_PHOTO_BYTES + 1,
      type: "image/png",
      name: "a.png",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("10MB");
  });

  it("非 image/* MIME → 错", () => {
    const r = validatePhotoFile({
      size: 1024,
      type: "application/pdf",
      name: "a.pdf",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("图片");
  });

  it("image/bmp 不在白名单 → 错", () => {
    const r = validatePhotoFile({
      size: 1024,
      type: "image/bmp",
      name: "a.bmp",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JPG|支持/);
  });

  it("合法 png → ok", () => {
    const r = validatePhotoFile({
      size: 50 * 1024,
      type: "image/png",
      name: "Sunset Photo.png",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ext).toBe("png");
      expect(r.sanitizedBase).toBe("Sunset-Photo");
    }
  });

  it("合法 jpeg + 文件名大小写规范化", () => {
    const r = validatePhotoFile({
      size: 1024,
      type: "image/jpeg",
      name: "IMG_001.JPG",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ext).toBe("jpg");
      expect(r.sanitizedBase).toBe("IMG_001");
    }
  });

  it("HEIC（iPhone）放行", () => {
    const r = validatePhotoFile({
      size: 1024,
      type: "image/heic",
      name: "IMG_1234.heic",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ext).toBe("heic");
  });
});
