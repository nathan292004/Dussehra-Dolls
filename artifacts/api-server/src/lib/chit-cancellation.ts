import { db } from "@workspace/db";
import { chitPlansTable, walletsTable, transactionsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { describeChitPlan } from "./chit-view";
import { fromPaise, paiseToDecimal, toPaise } from "./money";

export interface CancelChitOptions {
  chitPlanId: number;
  userId?: string;
  adminId?: number;
  reason?: string;
  cancelledBy: "customer" | "admin";
}

export type CancelChitResult =
  | { success: true; refundedAmount: number; plan: ReturnType<typeof describeChitPlan> }
  | { success: false; status: number; error: string };

/**
 * Atomically cancels a chit plan, handles refunds if payments were made,
 * adjusts the customer wallet balances, and logs transaction history.
 */
export async function cancelChitPlan(opts: CancelChitOptions): Promise<CancelChitResult> {
  return await db.transaction(async (tx) => {
    const [plan] = await tx
      .select()
      .from(chitPlansTable)
      .where(eq(chitPlansTable.id, opts.chitPlanId))
      .for("update");

    if (!plan) {
      return { success: false, status: 404, error: "Chit plan not found" };
    }
    if (opts.userId && plan.userId !== opts.userId) {
      return { success: false, status: 403, error: "You cannot cancel someone else's chit plan" };
    }
    if (plan.status === "cancelled") {
      return { success: false, status: 400, error: "This chit plan is already cancelled" };
    }
    if (plan.status === "completed") {
      return { success: false, status: 400, error: "Completed chit plans cannot be cancelled" };
    }
    if (plan.isRejected) {
      return { success: false, status: 400, error: "Rejected chit plans cannot be cancelled" };
    }

    const paidPaise = toPaise(plan.amountPaid);

    // If payments were made, refund the principal from locked chit savings to spendable wallet balance
    if (paidPaise > 0) {
      await tx
        .update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} + ${paiseToDecimal(paidPaise)}::numeric`,
          chitLockedBalance: sql`GREATEST(${walletsTable.chitLockedBalance} - ${paiseToDecimal(paidPaise)}::numeric, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(walletsTable.userId, plan.userId));

      await tx.insert(transactionsTable).values({
        userId: plan.userId,
        type: "credit",
        amount: paiseToDecimal(paidPaise),
        description: `Refund for cancelled chit – ${plan.name} (${
          opts.cancelledBy === "admin" ? "Admin cancellation" : "Customer cancellation"
        })`,
      });
    }

    const [updatedPlan] = await tx
      .update(chitPlansTable)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason:
          opts.reason ||
          (opts.cancelledBy === "admin" ? "Cancelled by administrator" : "Cancelled by customer"),
        cancelledBy: opts.cancelledBy,
      })
      .where(eq(chitPlansTable.id, plan.id))
      .returning();

    return {
      success: true,
      refundedAmount: fromPaise(paidPaise),
      plan: describeChitPlan(updatedPlan),
    };
  });
}
