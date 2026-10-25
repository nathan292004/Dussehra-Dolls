import crypto from "crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { otpVerificationsTable } from "@workspace/db/schema";
import { signingSecret } from "./jwt";

// ─── Rules ───────────────────────────────────────────────────────────────────
export const OTP_VALID_MINUTES = 10;
export const OTP_MAX_WRONG_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_SENDS_PER_HOUR = 5;

export type OtpPurpose = "register" | "reset";

export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * One-time codes are stored as a keyed hash (HMAC-SHA256), never as the code itself, and tied to the
 * phone number and purpose, so a leaked database does not reveal any code that is still valid.
 */
export function hashOtp(phone: string, purpose: string, code: string): string {
  return crypto
    .createHmac("sha256", signingSecret("customer"))
    .update(`otp|${purpose}|${phone}|${code}`)
    .digest("hex");
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export type OtpResult = { ok: true; id: number } | { ok: false; status: number; error: string };

/**
 * Checks a code the customer typed. A code works once, for one purpose, for 10 minutes, and
 * dies after 5 wrong guesses. (The caller marks it used in the same transaction as its action.)
 */
export async function checkOtp(phone: string, purpose: OtpPurpose, code: string): Promise<OtpResult> {
  const [row] = await db
    .select()
    .from(otpVerificationsTable)
    .where(
      and(
        eq(otpVerificationsTable.phone, phone),
        eq(otpVerificationsTable.purpose, purpose),
        eq(otpVerificationsTable.verified, false),
        eq(otpVerificationsTable.isDeleted, false),
        gt(otpVerificationsTable.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpVerificationsTable.createdAt), desc(otpVerificationsTable.id))
    .limit(1);

  if (!row) return { ok: false, status: 400, error: "Invalid or expired OTP. Please request a new one." };
  if (row.attempts >= OTP_MAX_WRONG_ATTEMPTS) {
    return { ok: false, status: 429, error: "Too many wrong attempts. Please request a new OTP." };
  }
  if (sameHash(row.otpHash, hashOtp(phone, purpose, code))) return { ok: true, id: row.id };

  const [updated] = await db
    .update(otpVerificationsTable)
    .set({ attempts: sql`${otpVerificationsTable.attempts} + 1` })
    .where(eq(otpVerificationsTable.id, row.id))
    .returning({ attempts: otpVerificationsTable.attempts });
  const left = OTP_MAX_WRONG_ATTEMPTS - (updated?.attempts ?? OTP_MAX_WRONG_ATTEMPTS);
  return left > 0
    ? { ok: false, status: 400, error: `Incorrect OTP. ${left} attempt${left === 1 ? "" : "s"} left.` }
    : { ok: false, status: 429, error: "Too many wrong attempts. Please request a new OTP." };
}
