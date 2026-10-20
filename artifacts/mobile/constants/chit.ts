// Chit plan rules. Keep in sync with artifacts/api-server/src/lib/chit-rules.ts.
//   1 chit = ₹500 per month, always 11 months, plus 10% bonus points (1 point = ₹1).
export const CHIT_VALUE = 500;
export const CHIT_DURATION_MONTHS = 11;
export const CHIT_BONUS_PERCENT = 10;
export const MIN_CHITS = 1;
export const MAX_CHITS = 100;
export const QUICK_PICK_CHITS = [2, 4, 6, 10];

export function chitPlanFigures(chits: number) {
  const monthly = chits * CHIT_VALUE;
  const total = monthly * CHIT_DURATION_MONTHS;
  const bonusPoints = Math.round((total * CHIT_BONUS_PERCENT) / 100);
  return { chits, monthly, total, bonusPoints, finalValue: total + bonusPoints };
}
