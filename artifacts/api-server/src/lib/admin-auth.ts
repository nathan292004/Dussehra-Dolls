import crypto from "crypto";
import { signToken, verifyToken } from "./jwt";

// ─── Password hashing (scrypt, built into Node) ─────────────────────────────
const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, { N: n }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_N);
  return `scrypt$${SCRYPT_N}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyAdminPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), Number(n));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Checked when the username does not exist, so response time doesn't reveal valid usernames.
export const DUMMY_PASSWORD_HASH =
  "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$" + Buffer.alloc(SCRYPT_KEYLEN).toString("base64url");

// ─── Signed tokens (JWT, see jwt.ts) ────────────────────────────────────────
export { ADMIN_TOKEN_TTL_SECONDS } from "./jwt";

export interface AdminTokenPayload {
  sub: number;
  username: string;
}

export function signAdminToken(admin: { id: number; username: string }): string {
  return signToken("admin", admin.id, { username: admin.username });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  const verified = verifyToken("admin", token);
  if (!verified) return null;
  const sub = Number(verified.sub);
  if (!Number.isInteger(sub) || sub <= 0) return null;
  return { sub, username: String(verified.claims.username ?? "") };
}
