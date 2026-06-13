import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  isEncryptionEnabled,
  _resetSecretBoxCache,
} from "./secret-box";

const SECRET = "test-master-secret-please-change-32+chars";

describe("secret-box", () => {
  beforeEach(() => {
    process.env.BITE_SETTINGS_SECRET = SECRET;
    _resetSecretBoxCache();
  });
  afterEach(() => {
    delete process.env.BITE_SETTINGS_SECRET;
    _resetSecretBoxCache();
  });

  it("加密后是密文（带前缀），解密还原", () => {
    const plain = "sk-ant-abc123XYZ";
    const enc = encryptSecret(plain);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("同一明文两次加密密文不同（随机 IV），但都能解回", () => {
    const plain = "AIzaSyEXAMPLEKEY";
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plain);
    expect(decryptSecret(b)).toBe(plain);
  });

  it("加密幂等：已是密文不再二次加密", () => {
    const enc = encryptSecret("hello-key");
    expect(encryptSecret(enc)).toBe(enc);
  });

  it("空串原样返回", () => {
    expect(encryptSecret("")).toBe("");
  });

  it("历史明文（无前缀）解密原样返回", () => {
    expect(decryptSecret("legacy-plaintext-key")).toBe("legacy-plaintext-key");
  });

  it("secret 未配置时 encrypt 降级为明文（不破坏现状）", () => {
    delete process.env.BITE_SETTINGS_SECRET;
    _resetSecretBoxCache();
    expect(isEncryptionEnabled()).toBe(false);
    const plain = "no-secret-key";
    expect(encryptSecret(plain)).toBe(plain);
  });

  it("密文遇到错误 secret 解不开 → 返回 null", () => {
    const enc = encryptSecret("secret-value");
    process.env.BITE_SETTINGS_SECRET = "a-totally-different-secret-value-here";
    _resetSecretBoxCache();
    expect(decryptSecret(enc)).toBeNull();
  });

  it("密文存在但 secret 被移除 → 返回 null", () => {
    const enc = encryptSecret("secret-value");
    delete process.env.BITE_SETTINGS_SECRET;
    _resetSecretBoxCache();
    expect(decryptSecret(enc)).toBeNull();
  });
});
