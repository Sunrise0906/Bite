// 应用层对称加密，用于把 user_llm_settings.api_key 加密后再落库（at-rest 防护，
// RLS 之外的纵深）。AES-256-GCM，密钥由 BITE_SETTINGS_SECRET 经 SHA-256 派生。
//
// 设计要点：
// - secret 是高熵的生成串（不是用户口令），所以用 SHA-256 直接派生 32 字节密钥即可，
//   无需 scrypt 的慢哈希；密钥派生结果缓存，解密在每次 LLM 调用前都会跑，要快。
// - 每条密文用随机 12 字节 IV，blob = iv(12) || authTag(16) || ciphertext，base64 存储，
//   带前缀 "encv1:" 以便和历史明文行区分。
// - 优雅降级：BITE_SETTINGS_SECRET 未设 → encrypt 原样返回明文（加密关闭），
//   decrypt 见到无前缀值也原样返回（兼容历史明文）。只有「设过 secret、存了密文、
//   后来又把 secret 删了」这种边角会解不开，返回 null。

import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "encv1:";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;
let cachedFromSecret: string | null = null;

function deriveKey(secret: string): Buffer {
  if (cachedKey && cachedFromSecret === secret) return cachedKey;
  const key = createHash("sha256").update(secret, "utf8").digest();
  cachedKey = key;
  cachedFromSecret = secret;
  return key;
}

function getSecret(): string | null {
  const s = process.env.BITE_SETTINGS_SECRET;
  return s && s.trim().length > 0 ? s : null;
}

export function isEncryptionEnabled(): boolean {
  return getSecret() !== null;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * 加密一个明文 secret。
 * - secret 未配置 → 原样返回（加密关闭，行为同今天）。
 * - 已是密文（幂等）→ 原样返回，避免双重加密。
 */
export function encryptSecret(plain: string): string {
  if (plain === "") return plain;
  if (isEncrypted(plain)) return plain;
  const secret = getSecret();
  if (!secret) return plain;

  const key = deriveKey(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, ct]).toString("base64");
  return PREFIX + blob;
}

/**
 * 解密。
 * - 无前缀（历史明文）→ 原样返回。
 * - 有前缀但 secret 缺失 / 解密失败 → 返回 null（无法使用，需用户重设）。
 */
export function decryptSecret(stored: string): string | null {
  if (!isEncrypted(stored)) return stored;
  const secret = getSecret();
  if (!secret) return null;

  try {
    const blob = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = blob.subarray(0, IV_LEN);
    const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = blob.subarray(IV_LEN + TAG_LEN);
    const key = deriveKey(secret);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/** 测试用：清掉派生密钥缓存（改了 env 后） */
export function _resetSecretBoxCache(): void {
  cachedKey = null;
  cachedFromSecret = null;
}
