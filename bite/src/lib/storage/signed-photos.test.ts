import { describe, expect, it } from "vitest";
import {
  extractPhotosPath,
  normalizePhotoUrl,
  signNestedPhotoUrls,
  signPhotoUrls,
  buildPhotoDisplayMap,
} from "./signed-photos";
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = "https://abc.supabase.co";
const pub = (path: string) =>
  `${BASE}/storage/v1/object/public/photos/${path}`;

describe("extractPhotosPath", () => {
  it("抽出自家 storage URL 的对象 path", () => {
    expect(extractPhotosPath(pub("uid/123-a.png"), BASE)).toBe("uid/123-a.png");
  });

  it("外链返回 null（XHS CDN / 图床）", () => {
    expect(
      extractPhotosPath("https://sns-img.xhscdn.com/abc123", BASE),
    ).toBeNull();
    expect(extractPhotosPath("https://i.imgur.com/x.png", BASE)).toBeNull();
  });

  it("同域但不是 photos public 路径 → null", () => {
    expect(
      extractPhotosPath(`${BASE}/storage/v1/object/public/other/x.png`, BASE),
    ).toBeNull();
    expect(extractPhotosPath(`${BASE}/rest/v1/places`, BASE)).toBeNull();
  });

  it("query / hash 会被剥掉", () => {
    expect(extractPhotosPath(pub("uid/a.png") + "?t=1#x", BASE)).toBe(
      "uid/a.png",
    );
  });

  it("URL 编码的 path 被解码（中文文件名）", () => {
    expect(extractPhotosPath(pub("uid/%E5%9B%BE.png"), BASE)).toBe(
      "uid/图.png",
    );
  });

  it("supabaseUrl 缺失 / 不匹配 → null（防误签外链）", () => {
    expect(extractPhotosPath(pub("uid/a.png"), undefined)).toBeNull();
    expect(
      extractPhotosPath(pub("uid/a.png"), "https://other.supabase.co"),
    ).toBeNull();
  });

  it("marker 后为空 → null", () => {
    expect(extractPhotosPath(pub(""), BASE)).toBeNull();
  });
});

describe("normalizePhotoUrl", () => {
  const sign = (path: string, q = "?token=abc.def") =>
    `${BASE}/storage/v1/object/sign/photos/${path}${q}`;

  it("自家 signed URL 归一化回 canonical", () => {
    expect(normalizePhotoUrl(sign("uid/a.png"), BASE)).toBe(pub("uid/a.png"));
  });

  it("canonical / 外链 / 其他 bucket 原样返回", () => {
    expect(normalizePhotoUrl(pub("uid/a.png"), BASE)).toBe(pub("uid/a.png"));
    expect(normalizePhotoUrl("https://sns-img.xhscdn.com/x", BASE)).toBe(
      "https://sns-img.xhscdn.com/x",
    );
    const other = `${BASE}/storage/v1/object/sign/other/x.png?token=t`;
    expect(normalizePhotoUrl(other, BASE)).toBe(other);
  });

  it("别的项目的 signed URL 不动（host 不匹配）", () => {
    const foreign = "https://other.supabase.co/storage/v1/object/sign/photos/u/a.png?token=t";
    expect(normalizePhotoUrl(foreign, BASE)).toBe(foreign);
  });

  it("无 token query / 带 hash 都能归一化", () => {
    expect(normalizePhotoUrl(sign("uid/a.png", ""), BASE)).toBe(pub("uid/a.png"));
    expect(normalizePhotoUrl(sign("uid/a.png", "#frag"), BASE)).toBe(pub("uid/a.png"));
  });

  it("supabaseUrl 缺失时原样返回", () => {
    expect(normalizePhotoUrl(sign("uid/a.png"), undefined)).toBe(sign("uid/a.png"));
  });
});

// -------- 签名流程（mock supabase.storage）--------

function mockClient(
  impl: (paths: string[]) => {
    data: Array<{ signedUrl: string | null }> | null;
    error: { message: string } | null;
  },
  calls: string[][] = [],
): SupabaseClient {
  return {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          calls.push(paths);
          return impl(paths);
        },
      }),
    },
  } as unknown as SupabaseClient;
}

const ORIG_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;

function withBase<T>(fn: () => Promise<T>): Promise<T> {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  return fn().finally(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_ENV;
  });
}

describe("signNestedPhotoUrls", () => {
  it("外链原样、自家图换 signed；跨组去重只签一次", () =>
    withBase(async () => {
      const calls: string[][] = [];
      const client = mockClient(
        (paths) => ({
          data: paths.map((p) => ({ signedUrl: `${BASE}/signed/${p}` })),
          error: null,
        }),
        calls,
      );
      const hero = pub("u/hero.png");
      const groups = [
        [hero, "https://sns-img.xhscdn.com/x"],
        [hero], // 同图第二组
      ];
      const out = await signNestedPhotoUrls(client, groups);
      expect(out[0][0]).toBe(`${BASE}/signed/u/hero.png`);
      expect(out[0][1]).toBe("https://sns-img.xhscdn.com/x");
      expect(out[1][0]).toBe(`${BASE}/signed/u/hero.png`);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual(["u/hero.png"]);
    }));

  it("全是外链 → 不调 storage API", () =>
    withBase(async () => {
      const calls: string[][] = [];
      const client = mockClient(
        () => ({ data: [], error: null }),
        calls,
      );
      const groups = [["https://a.com/1.png"], []];
      expect(await signNestedPhotoUrls(client, groups)).toEqual(groups);
      expect(calls).toHaveLength(0);
    }));

  it("API 整体报错 → 回退原 URL 不 throw", () =>
    withBase(async () => {
      const client = mockClient(() => ({
        data: null,
        error: { message: "boom" },
      }));
      const groups = [[pub("u/a.png")]];
      expect(await signNestedPhotoUrls(client, groups)).toEqual(groups);
    }));

  it("单条签名失败（signedUrl null）→ 该条回退原 URL", () =>
    withBase(async () => {
      const client = mockClient((paths) => ({
        data: paths.map((p, i) =>
          i === 0 ? { signedUrl: null } : { signedUrl: `s/${p}` },
        ),
        error: null,
      }));
      const a = pub("u/a.png");
      const b = pub("u/b.png");
      const [out] = await signNestedPhotoUrls(client, [[a, b]]);
      expect(out[0]).toBe(a);
      expect(out[1]).toBe("s/u/b.png");
    }));
});

describe("buildPhotoDisplayMap", () => {
  it("只收录真的换成 signed 的 URL", () =>
    withBase(async () => {
      const client = mockClient((paths) => ({
        data: paths.map((p) => ({ signedUrl: `s/${p}` })),
        error: null,
      }));
      const mine = pub("u/a.png");
      const ext = "https://a.com/1.png";
      const map = await buildPhotoDisplayMap(client, [mine, ext, mine]);
      expect(map[mine]).toBe("s/u/a.png");
      expect(map[ext]).toBeUndefined();
      expect(Object.keys(map)).toHaveLength(1);
    }));
});

describe("signPhotoUrls", () => {
  it("空数组安全", () =>
    withBase(async () => {
      const client = mockClient(() => ({ data: [], error: null }));
      expect(await signPhotoUrls(client, [])).toEqual([]);
    }));
});
