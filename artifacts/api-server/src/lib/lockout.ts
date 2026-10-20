// Brute-force protection shared by customer and admin logins:
// 5 wrong passwords in a row locks the account for 15 minutes.
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export function isLocked(lockedUntil: Date | null, now: Date = new Date()): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}

export function minutesLeft(lockedUntil: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

export function lockMessage(lockedUntil: Date, now: Date = new Date()): string {
  const m = minutesLeft(lockedUntil, now);
  return `Too many wrong attempts. Please try again in ${m} minute${m === 1 ? "" : "s"}.`;
}

/** Postgres unique-violation, whether raised directly or wrapped by the ORM. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Name of the unique constraint/index that was violated, or null if this was not a unique violation. */
export function uniqueViolationConstraint(err: unknown): string | null {
  if (!isUniqueViolation(err)) return null;
  const e = err as { constraint?: string; cause?: { constraint?: string } };
  return e.constraint ?? e.cause?.constraint ?? null;
}
