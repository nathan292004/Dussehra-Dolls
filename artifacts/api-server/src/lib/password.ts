import bcrypt from "bcryptjs";

// Customer passwords are stored as bcrypt hashes. (Admin passwords use scrypt, see admin-auth.ts.)
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
// bcrypt only uses the first 72 bytes of a password, so longer ones are refused.
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 6;
// Compared against when the phone number is unknown, so timing doesn't reveal which numbers exist.
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** Why a new password is not acceptable, or null if it is fine. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} characters`;
  }
  return null;
}
