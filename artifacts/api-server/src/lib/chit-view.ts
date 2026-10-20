import type { chitPlansTable } from "@workspace/db/schema";
import { cycleMonthNames, enrollmentDue, firstOfNextMonth } from "./chit-rules";
import { toPaise, toRupees } from "./money";

export type ChitPlanRow = typeof chitPlansTable.$inferSelect;

export type ChitReviewStatus = "under_review" | "rejected" | "active" | "completed" | "cancelled";

/** The one place that turns the database flags into a plain-language state. */
export function chitReviewStatus(plan: Pick<ChitPlanRow, "isApproved" | "isRejected" | "status">): ChitReviewStatus {
  if (plan.status === "cancelled") return "cancelled";
  if (plan.isRejected) return "rejected";
  if (!plan.isApproved) return "under_review";
  return plan.status === "completed" ? "completed" : "active";
}

/** What a plan owes right now. Only an approved, active plan owes anything. */
export function chitPlanDue(plan: ChitPlanRow, now: Date = new Date()) {
  return enrollmentDue({
    monthly: plan.monthlyAmount,
    total: plan.totalAmount,
    paid: plan.amountPaid,
    startYear: plan.cycleStartYear,
    now,
  });
}

/** A plan as the customer's app and the admin dashboards see it. All money in rupees. */
export function describeChitPlan(plan: ChitPlanRow, now: Date = new Date()) {
  const reviewStatus = chitReviewStatus(plan);
  const due = chitPlanDue(plan, now);
  const owes = reviewStatus === "active";
  const monthly = toRupees(plan.monthlyAmount);
  const paid = toRupees(plan.amountPaid);
  const names = cycleMonthNames();
  return {
    id: plan.id,
    userId: plan.userId,
    name: plan.name,
    chits: plan.chits,
    monthlyAmount: monthly,
    totalAmount: toRupees(plan.totalAmount),
    bonusPoints: plan.bonusPoints,
    durationMonths: plan.durationMonths,
    cycleStartYear: plan.cycleStartYear,
    cycleLabel: `October ${plan.cycleStartYear} – August ${plan.cycleStartYear + 1}`,
    amountPaid: paid,
    reviewStatus,
    isApproved: plan.isApproved,
    isRejected: plan.isRejected,
    rejectionReason: plan.rejectionReason,
    createdAt: plan.createdAt,
    reviewedAt: plan.reviewedAt,
    completedAt: plan.completedAt,
    // Money due so far this plan year, and how much of it is still unpaid.
    monthsDue: owes ? due.monthsDue : 0,
    dueToDate: owes ? due.dueToDate : 0,
    outstanding: owes ? due.outstanding : 0,
    // How many whole months' worth the customer has paid (for the progress display).
    monthsPaid: toPaise(monthly) > 0 ? Math.min(plan.durationMonths, Math.floor(toPaise(paid) / toPaise(monthly))) : 0,
    // The month the customer is paying for right now, and when the next one opens.
    currentMonthName: owes && due.monthsDue > 0 ? names[due.monthsDue - 1] : null,
    nextPaymentDate: owes ? firstOfNextMonth(now) : null,
    lockedAmount: owes ? paid : 0,
  };
}
