// AES-256-GCM for secrets stored in the database. The key comes from SETTINGS_SECRET.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

function key() {
  const secret = process.env.SETTINGS_SECRET;
  if (!secret) throw new Error("SETTINGS_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decrypt(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1") throw new Error("unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Constant-time comparison for the admin password. */
export function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const mask = (v: string) => (v.length <= 10 ? "••••" : `${v.slice(0, 6)}…${v.slice(-4)}`);
