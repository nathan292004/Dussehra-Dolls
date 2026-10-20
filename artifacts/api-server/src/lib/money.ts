// Money is stored in Postgres as exact decimals (numeric(10,2)) and ALL arithmetic on the
// server is done on whole paise (integers), so there is never a floating-point rounding error.
//   ₹499.50  ->  49950 paise.
// The API still talks in rupees (numbers with at most 2 decimals) so the apps are unaffected.

const DECIMAL = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a money value coming from the database (a decimal string like "499.50") or a JS number
 * into whole paise. Throws if the value is not a valid amount with at most 2 decimal places.
 */
export function toPaise(value: string | number | null | undefined): number {
  const paise = parsePaise(value);
  if (paise === null) throw new Error(`Invalid money amount: ${String(value)}`);
  return paise;
}

/** Like toPaise but returns null for anything that is not a valid amount (use for user input). */
export function parsePaise(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const scaled = Math.round(value * 100);
    // Reject more than 2 decimal places (e.g. 19.999) instead of silently rounding.
    if (Math.abs(value * 100 - scaled) > 1e-6) return null;
    return Number.isSafeInteger(scaled) ? scaled : null;
  }
  if (typeof value === "string") {
    const m = DECIMAL.exec(value.trim());
    if (!m) return null;
    const rupees = Number(m[2]);
    const paise = Number((m[3] ?? "").padEnd(2, "0") || "0");
    const total = rupees * 100 + paise;
    if (!Number.isSafeInteger(total)) return null;
    return m[1] === "-" ? -total : total;
  }
  return null;
}

/** Paise -> rupees as a JS number for API responses (exact to 2 decimals). */
export function fromPaise(paise: number): number {
  return paise / 100;
}

/** Paise -> decimal string for the database, e.g. 49950 -> "499.50". */
export function paiseToDecimal(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error(`Paise must be a whole number, got ${paise}`);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Sum of whole-paise amounts. */
export function sumPaise(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** A database money value ("499.50") as a rupee number for API responses. */
export function toRupees(value: string | number): number {
  return fromPaise(toPaise(value));
}
