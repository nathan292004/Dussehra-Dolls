import crypto from "crypto";

const secret = process.env.AUTH_TOKEN_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : crypto.randomBytes(32).toString("hex"));

if (!secret) throw new Error("AUTH_TOKEN_SECRET is required in production");

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string): { valid: boolean; legacy: boolean } {
  if (stored.startsWith("scrypt:")) {
    const [, salt, key] = stored.split(":");
    if (!salt || !key || !/^[a-f0-9]{128}$/i.test(key)) return { valid: false, legacy: false };
    const supplied = crypto.scryptSync(password, salt, 64);
    return { valid: crypto.timingSafeEqual(supplied, Buffer.from(key, "hex")), legacy: false };
  }
  // Upgrade existing local accounts on their next successful login.
  if (!/^[a-f0-9]{64}$/i.test(stored)) return { valid: false, legacy: false };
  const old = crypto.createHash("sha256").update(password).digest();
  return { valid: crypto.timingSafeEqual(old, Buffer.from(stored, "hex")), legacy: true };
}

export function generateToken(userId: number): string {
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `v1.${userId}.${expires}.${crypto.randomBytes(12).toString("base64url")}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1" || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2])) return null;
  const payload = parts.slice(0, 4).join(".");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(parts[4], "base64url");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  if (Number(parts[2]) < Date.now()) return null;
  const userId = Number(parts[1]);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}
