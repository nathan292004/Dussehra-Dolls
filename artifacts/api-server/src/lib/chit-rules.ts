// Business rules for chit plans. Keep in sync with artifacts/mobile/constants/chit.ts.
//   1 chit            = ₹500 per month
//   cycle             = every year, October to August (11 months)
//   bonus points      = 10% of everything paid over the 11 months (1 point = ₹1)
//   late joiners      = pay every month since October up front to catch up
//   chit money        = locked in the wallet until the plan completes (August)
//   reminders         = WhatsApp on the 4th (to everyone with a pending amount)
//                       and on the 10th (only those still pending)
// All "what month is it" logic uses Indian Standard Time.
export const CHIT_VALUE = 500;
export const CHIT_DURATION_MONTHS = 11;
export const CHIT_BONUS_PERCENT = 10;
export const MIN_CHITS = 1;
export const MAX_CHITS = 100;
export const CYCLE_START_MONTH = 9; // October (months are 0-based)
export const REMINDER_DAY_FIRST = 4;
export const REMINDER_DAY_SECOND = 10;

import { fromPaise, toPaise } from "./money";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istParts(date: Date = new Date()) {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours() };
}

export function isValidChitCount(chits: unknown): chits is number {
  return Number.isInteger(chits) && (chits as number) >= MIN_CHITS && (chits as number) <= MAX_CHITS;
}

export function chitPlanFigures(chits: number) {
  const monthly = chits * CHIT_VALUE;
  const total = monthly * CHIT_DURATION_MONTHS;
  const bonusPoints = Math.round((total * CHIT_BONUS_PERCENT) / 100);
  return { chits, monthly, total, bonusPoints, finalValue: total + bonusPoints };
}

/** Bonus points earned by completing a plan with this total (works from stored plan data). */
export function bonusPointsForTotal(totalAmount: number): number {
  return Math.round((totalAmount * CHIT_BONUS_PERCENT) / 100);
}

/** Month names covered by a cycle that starts in October of `startYear`: October ... August. */
export function cycleMonthNames(): string[] {
  return Array.from({ length: CHIT_DURATION_MONTHS }, (_, i) => MONTH_NAMES[(CYCLE_START_MONTH + i) % 12]);
}

/** Year of the October that starts the cycle `date` belongs to (September counts as the cycle that just ended). */
export function cycleStartYearFor(date: Date = new Date()): number {
  const p = istParts(date);
  return p.month >= CYCLE_START_MONTH ? p.year : p.year - 1;
}

/** How many monthly payments are due so far (October = 1 ... August = 11), counting from October of `startYear`. */
export function monthsDueFor(startYear: number, now: Date = new Date()): number {
  const p = istParts(now);
  const n = p.year * 12 + p.month - (startYear * 12 + CYCLE_START_MONTH) + 1;
  return Math.max(0, Math.min(CHIT_DURATION_MONTHS, n));
}

export interface CycleStatus {
  /** True from 1 October to 31 August. September is between cycles. */
  open: boolean;
  startYear: number;
  label: string; // "October 2026 – August 2027"
  /** Which month of the cycle it is now (October = 1 ... August = 11). */
  monthNumber: number;
  monthName: string;
  /** Months a new joiner must pay now: October up to and including this month. */
  catchUpMonths: string[];
  /** When joining is closed, the year of the next cycle's October. */
  nextCycleStartYear: number | null;
}

export function getCycleStatus(now: Date = new Date()): CycleStatus {
  const startYear = cycleStartYearFor(now);
  const p = istParts(now);
  const raw = p.year * 12 + p.month - (startYear * 12 + CYCLE_START_MONTH) + 1; // 1..12
  const open = raw <= CHIT_DURATION_MONTHS;
  const monthNumber = Math.min(raw, CHIT_DURATION_MONTHS);
  return {
    open,
    startYear,
    label: `October ${startYear} – August ${startYear + 1}`,
    monthNumber,
    monthName: MONTH_NAMES[p.month],
    catchUpMonths: open ? cycleMonthNames().slice(0, monthNumber) : [],
    nextCycleStartYear: open ? null : startYear + 1,
  };
}

/** True once the plan year that started in October of `startYear` is over (from 1 September of the next year). */
export function cycleHasEnded(startYear: number, now: Date = new Date()): boolean {
  const p = istParts(now);
  return p.year * 12 + p.month >= (startYear + 1) * 12 + 8;
}

/**
 * What an enrollment owes right now. Takes rupees (database values or numbers with at most
 * 2 decimals), calculates in whole paise, and returns rupees plus the exact paise figures.
 */
export function enrollmentDue(opts: {
  monthly: string | number;
  total: string | number;
  paid: string | number;
  startYear: number;
  now?: Date;
}) {
  const monthly = toPaise(opts.monthly);
  const total = toPaise(opts.total);
  const paid = toPaise(opts.paid);
  const monthsDue = monthsDueFor(opts.startYear, opts.now);
  const dueToDate = Math.min(total, monthsDue * monthly);
  const outstanding = Math.max(0, dueToDate - paid);
  return {
    monthsDue,
    dueToDate: fromPaise(dueToDate),
    outstanding: fromPaise(outstanding),
    outstandingPaise: outstanding,
    isCompleted: paid >= total,
  };
}

/** Start of the next calendar month in IST (as a real instant), used for "next payment opens". */
export function firstOfNextMonth(now: Date = new Date()): Date {
  const p = istParts(now);
  return new Date(Date.UTC(p.year, p.month + 1, 1) - IST_OFFSET_MS);
}

export function formatRupees(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
