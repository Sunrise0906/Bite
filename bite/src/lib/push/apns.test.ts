import { describe, expect, it } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { buildApnsJwt } from "./apns";

describe("buildApnsJwt", () => {
  it("产出可验签的 ES256 JWS，header/claims 按 Apple 要求", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const jwt = buildApnsJwt(
      { teamId: "TEAM123456", keyId: "KEYID12345", privateKey },
      1_700_000_000,
    );
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEYID12345",
    });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: 1_700_000_000,
    });
    // APNs 要 r||s（ieee-p1363），不是 DER —— 用同样的编码验签才通过
    const ok = verify(
      "sha256",
      Buffer.from(`${h}.${c}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(s, "base64url"),
    );
    expect(ok).toBe(true);
    // base64url：不能有 = + /
    expect(jwt).not.toMatch(/[=+/]/);
  });
});
