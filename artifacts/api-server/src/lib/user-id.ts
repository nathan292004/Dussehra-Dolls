import crypto from "crypto";
import { istParts } from "./chit-rules";
import { uniqueViolationConstraint } from "./lockout";

// A user's permanent id looks like  user_191026kQzTb :
//   "user_" + the registration date as ddmmyy (Indian time) + 5 random upper/lower-case letters.
// The letters give 52^5 (about 380 million) combinations per day, and the database primary key
// guarantees uniqueness: on the very rare clash we simply generate another id and try again.
const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const USER_ID_PATTERN = /^user_\d{6}[A-Za-z]{5}$/;

export function generateUserId(now: Date = new Date()): string {
  const p = istParts(now);
  const dd = String(p.day).padStart(2, "0");
  const mm = String(p.month + 1).padStart(2, "0");
  const yy = String(p.year % 100).padStart(2, "0");
  let letters = "";
  for (let i = 0; i < 5; i++) letters += LETTERS[crypto.randomInt(LETTERS.length)];
  return `user_${dd}${mm}${yy}${letters}`;
}

export function isUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID_PATTERN.test(value);
}

/**
 * Runs `create` with a fresh user id. If the database reports that id is already taken
 * (primary key clash), tries again with a new one (up to `attempts` times).
 */
export async function withNewUserId<T>(create: (userId: string) => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await create(generateUserId());
    } catch (err) {
      if (i < attempts && uniqueViolationConstraint(err) === "users_pkey") continue;
      throw err;
    }
  }
}
