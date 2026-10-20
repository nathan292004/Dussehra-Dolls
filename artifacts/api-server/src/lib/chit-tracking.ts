import { db } from "@workspace/db";
import { chitPlansTable, chitReminderLogTable, usersTable } from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { describeChitPlan, chitPlanDue } from "./chit-view";
import { REMINDER_DAY_SECOND, istParts } from "./chit-rules";
import { toPaise } from "./money";

export type PaymentStatus = "paid" | "pending" | "overdue" | "completed";

/**
 * Every approved chit plan with its owner, what is owed, and how it has been reminded.
 * "overdue" = earlier months are unpaid, or this month is still unpaid after the 10th.
 */
export async function loadTrackedChitPlans(now: Date = new Date()) {
  const rows = await db
    .select({
      plan: chitPlansTable,
      user: {
        userId: usersTable.userId,
        index: usersTable.index,
        fname: usersTable.fname,
        lname: usersTable.lname,
        phone: usersTable.phone,
        isDeleted: usersTable.isDeleted,
      },
    })
    .from(chitPlansTable)
    .innerJoin(usersTable, eq(chitPlansTable.userId, usersTable.userId))
    .where(and(eq(chitPlansTable.isApproved, true), eq(chitPlansTable.isRejected, false)))
    .orderBy(desc(chitPlansTable.createdAt));

  const reminderStats = await db
    .select({
      chitPlanId: chitReminderLogTable.chitPlanId,
      sent: sql<number>`count(*) filter (where ${chitReminderLogTable.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${chitReminderLogTable.status} = 'failed')::int`,
      lastSentAt: sql<Date | null>`max(${chitReminderLogTable.sentAt})`,
    })
    .from(chitReminderLogTable)
    .groupBy(chitReminderLogTable.chitPlanId);
  const statsByPlan = new Map(reminderStats.map((r) => [r.chitPlanId, r]));

  const day = istParts(now).day;

  return rows.map(({ plan, user }) => {
    const view = describeChitPlan(plan, now);
    const due = chitPlanDue(plan, now);
    const monthlyPaise = toPaise(plan.monthlyAmount);
    const outstandingPaise = view.reviewStatus === "active" ? due.outstandingPaise : 0;
    const monthsPending = monthlyPaise > 0 ? Math.ceil(outstandingPaise / monthlyPaise) : 0;

    let paymentStatus: PaymentStatus;
    if (view.reviewStatus === "completed") paymentStatus = "completed";
    else if (outstandingPaise <= 0) paymentStatus = "paid";
    else if (monthsPending >= 2 || day > REMINDER_DAY_SECOND) paymentStatus = "overdue";
    else paymentStatus = "pending";

    const stats = statsByPlan.get(plan.id);
    return {
      ...view,
      customer: {
        userId: user.userId,
        index: user.index,
        name: [user.fname, user.lname].filter(Boolean).join(" "),
        phone: user.phone,
        isDeleted: user.isDeleted,
      },
      paymentStatus,
      monthsPending,
      isPartiallyPaid: outstandingPaise > 0 && toPaise(plan.amountPaid) > 0 && outstandingPaise < monthlyPaise,
      neverPaid: toPaise(plan.amountPaid) === 0,
      remindersSent: stats?.sent ?? 0,
      remindersFailed: stats?.failed ?? 0,
      lastReminderAt: stats?.lastSentAt ?? null,
    };
  });
}

export type TrackedChitPlan = Awaited<ReturnType<typeof loadTrackedChitPlans>>[number];
