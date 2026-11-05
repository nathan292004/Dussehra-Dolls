import { execFileSync } from "node:child_process";

// Test-only helper: DEV_OTP_MODE is off (the app sends real SMS now), so tests that need to drive
// a full register/reset flow read the plaintext OTP straight out of the database instead of
// relying on a delivered SMS. Mirrors what support staff would do to help a customer manually.
const PSQL = "/opt/homebrew/opt/postgresql@17/bin/psql";
const CONN = ["-h", "127.0.0.1", "-p", "5433", "-U", "nathan", "-d", "dolldime"];

export function latestOtp(phone: string, purpose: "register" | "reset"): string {
  // The API normalizes a bare 10-digit number to "+91XXXXXXXXXX" before storing it.
  const normalized = phone.startsWith("+") ? phone : `+91${phone}`;
  const out = execFileSync(PSQL, [
    ...CONN,
    "-t",
    "-A",
    "-c",
    `SELECT otp FROM otp_verifications WHERE phone = '${normalized}' AND purpose = '${purpose}' ORDER BY created_at DESC LIMIT 1;`,
  ]).toString().trim();
  if (!/^\d{6}$/.test(out)) throw new Error(`No OTP found in DB for ${phone}/${purpose}: "${out}"`);
  return out;
}
