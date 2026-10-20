import type Razorpay from "razorpay";
import { db } from "@workspace/db";
import {
  chitPlansTable,
  transactionsTable,
  walletsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { enrollmentDue, firstOfNextMonth } from "./chit-rules";
import { fromPaise, paiseToDecimal, toPaise } from "./money";
import { PaymentCheckError, loadCapturedPayment } from "./razorpay";
import { notifyChitEmiPaid, notifyChitPartialPayment } from "./whatsapp-notifications";

export class ChitPaymentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Asks Razorpay what was really paid. Only a captured payment that belongs to the
 * given order, and whose order was created for a chit payment, is accepted.
 * The amount comes from Razorpay (in paise), never from the app.
 */
export async function loadCapturedChitPayment(rp: Razorpay, paymentId: string, orderId: string) {
  let loaded;
  try {
    loaded = await loadCapturedPayment(rp, paymentId, orderId);
  } catch (err) {
    if (err instanceof PaymentCheckError) throw new ChitPaymentError(err.message, err.status);
    throw err;
  }
  const chitPlanId = Number(loaded.notes.chitPlanId);
  const userId = typeof loaded.notes.userId === "string" ? loaded.notes.userId : "";
  if (loaded.notes.purpose !== "chit_payment" || !Number.isInteger(chitPlanId) || !userId) {
    throw new ChitPaymentError("This is not a chit payment.");
  }
  return { amountPaise: loaded.amountPaise, chitPlanId, userId };
}

export interface AppliedChitPayment {
  /** False when this Razorpay payment had already been recorded (safe repeat). */
  applied: boolean;
  /** Rupees received in this payment. */
  received: number;
  paidTotal: number;
  totalAmount: number;
  outstandingAfter: number;
  completed: boolean;
  bonusPoints: number;
}

/**
 * Records a verified chit payment: adds it to the plan, locks it in the wallet,
 * and, if it finishes the plan, unlocks the savings and credits the bonus points.
 * Safe to call more than once for the same Razorpay payment id (verify route + webhook).
 * All arithmetic is in whole paise.
 */
export async function applyChitPayment(opts: {
  chitPlanId: number;
  userId: string;
  razorpayPaymentId: string;
  amountPaise: number; // what Razorpay actually received
}): Promise<AppliedChitPayment> {
  if (!Number.isSafeInteger(opts.amountPaise) || opts.amountPaise <= 0) {
    throw new ChitPaymentError("The payment amount is not valid.");
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${opts.razorpayPaymentId}))`);

    const [plan] = await tx
      .select()
      .from(chitPlansTable)
      .where(eq(chitPlansTable.id, opts.chitPlanId))
      .for("update");
    if (!plan || plan.userId !== opts.userId) {
      throw new ChitPaymentError("Chit plan not found.", 404);
    }
    const totalPaise = toPaise(plan.totalAmount);
    const bonusPaise = plan.bonusPoints * 100;
    const paidBeforePaise = toPaise(plan.amountPaid);

    const [previous] = await tx
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.razorpayPaymentId, opts.razorpayPaymentId))
      .limit(1);
    if (previous) {
      const due = enrollmentDue({ monthly: plan.monthlyAmount, total: plan.totalAmount, paid: plan.amountPaid, startYear: plan.cycleStartYear });
      return {
        applied: false, received: fromPaise(opts.amountPaise), paidTotal: fromPaise(paidBeforePaise),
        totalAmount: fromPaise(totalPaise), outstandingAfter: due.outstanding,
        completed: plan.status === "completed", bonusPoints: plan.bonusPoints, planName: plan.name,
      };
    }
    if (!plan.isApproved || plan.isRejected || plan.status !== "active") {
      // Money was captured for a plan that cannot take it. Needs a manual refund.
      console.error(
        `[ChitPayment] Payment ${opts.razorpayPaymentId} (${paiseToDecimal(opts.amountPaise)} INR) arrived for chit plan ${plan.id} (approved=${plan.isApproved}, rejected=${plan.isRejected}, status=${plan.status}); refund required.`,
      );
      throw new ChitPaymentError(
        plan.status === "completed"
          ? "This chit plan is already fully paid. Contact support for a refund."
          : "This chit plan cannot take payments. Contact support for a refund.",
        409,
      );
    }

    const paidPaise = paidBeforePaise + opts.amountPaise;
    const completed = paidPaise >= totalPaise;
    const due = enrollmentDue({
      monthly: plan.monthlyAmount, total: plan.totalAmount, paid: paiseToDecimal(paidPaise), startYear: plan.cycleStartYear,
    });

    await tx
      .update(chitPlansTable)
      .set({
        amountPaid: paiseToDecimal(paidPaise),
        status: completed ? "completed" : "active",
        completedAt: completed ? new Date() : null,
      })
      .where(eq(chitPlansTable.id, plan.id));

    await tx.insert(transactionsTable).values({
      userId: opts.userId,
      type: "debit",
      amount: paiseToDecimal(opts.amountPaise),
      razorpayPaymentId: opts.razorpayPaymentId,
      description: `Chit payment – ${plan.name} (${opts.razorpayPaymentId})`,
    });

    // The money sits in the wallet's locked balance until the plan completes.
    await tx
      .insert(walletsTable)
      .values({ userId: opts.userId, chitLockedBalance: paiseToDecimal(opts.amountPaise) })
      .onConflictDoUpdate({
        target: walletsTable.userId,
        set: {
          chitLockedBalance: sql`${walletsTable.chitLockedBalance} + ${paiseToDecimal(opts.amountPaise)}::numeric`,
          updatedAt: new Date(),
        },
      });

    if (completed) {
      await tx
        .update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} + ${paiseToDecimal(paidPaise + bonusPaise)}::numeric`,
          chitLockedBalance: sql`GREATEST(${walletsTable.chitLockedBalance} - ${paiseToDecimal(paidPaise)}::numeric, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(walletsTable.userId, opts.userId));
      await tx.insert(transactionsTable).values([
        {
          userId: opts.userId,
          type: "credit",
          amount: paiseToDecimal(paidPaise),
          description: `Chit savings unlocked – ${plan.name}`,
        },
        {
          userId: opts.userId,
          type: "credit",
          amount: paiseToDecimal(bonusPaise),
          description: `Chit bonus points – ${plan.name}`,
        },
      ]);
    }

    return {
      applied: true, received: fromPaise(opts.amountPaise), paidTotal: fromPaise(paidPaise),
      totalAmount: fromPaise(totalPaise), outstandingAfter: due.outstanding, completed,
      bonusPoints: plan.bonusPoints, planName: plan.name,
    };
  });

  if (result.applied) {
    notifyAfterPayment(opts.userId, opts.chitPlanId, result).catch((e) =>
      console.error("[WhatsApp] Chit payment notify failed:", e),
    );
  }
  const { planName: _planName, ...summary } = result;
  return summary;
}

async function notifyAfterPayment(userId: string, chitPlanId: number, r: AppliedChitPayment & { planName: string }) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, userId)).limit(1);
  if (!user?.phone) return;
  const who = { phone: user.phone, name: [user.fname, user.lname].filter(Boolean).join(" ") || "Customer", userId, chitPlanId };

  if (r.completed) {
    await notifyChitEmiPaid({
      ...who, planName: r.planName, emiAmount: r.received,
      totalPaid: r.paidTotal, totalAmount: r.totalAmount, isCompleted: true, bonusPoints: r.bonusPoints,
    });
  } else if (r.outstandingAfter > 0) {
    // Money arrived but the amount due is still not fully covered.
    await notifyChitPartialPayment({
      ...who, planName: r.planName, received: r.received,
      stillPending: r.outstandingAfter, totalPaid: r.paidTotal, totalAmount: r.totalAmount,
    });
  } else {
    await notifyChitEmiPaid({
      ...who, planName: r.planName, emiAmount: r.received,
      totalPaid: r.paidTotal, totalAmount: r.totalAmount, isCompleted: false,
      nextPaymentDate: firstOfNextMonth(),
    });
  }
}
