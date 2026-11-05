import { db } from "@workspace/db";
import { chitPlansTable, transactionsTable, walletsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

// Business rule (owner's decision): a customer may cancel a chit plan at any time before it
// completes. Everything they paid in moves from the wallet's locked chit balance to the
// spendable balance (usable for dolls). No bonus points are given; nothing goes back to the bank.
//
// All of it happens in one database transaction, locking the plan row first and then the wallet
// row — the same order the payment code uses — so a cancellation racing a payment can't deadlock,
// and one simply waits for the other. Money maths is done by Postgres on exact numeric values.

export class CancelError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "CancelError";
  }
}

export interface CancelResult {
  chitPlanId: number;
  planName: string;
  /** Rupees moved from locked to spendable balance (0 if nothing had been paid). */
  releasedAmount: number;
  /** True when the plan was already cancelled (a retried request): nothing changed this time. */
  alreadyCancelled: boolean;
  wallet: { balance: number; lockedBalance: number } | null;
}

const MAX_REASON_LENGTH = 300;

/** Postgres error code; drizzle wraps driver errors and keeps the original in `cause`. */
function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

export function cleanReason(reason: unknown): string {
  if (typeof reason !== "string" || !reason.trim()) return "customer_request";
  return reason.trim().slice(0, MAX_REASON_LENGTH);
}

export async function cancelChitPlan(opts: { chitPlanId: number; userId: string; reason: string }): Promise<CancelResult> {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .select()
      .from(chitPlansTable)
      .where(and(eq(chitPlansTable.id, opts.chitPlanId), eq(chitPlansTable.userId, opts.userId)))
      .for("update");
    // Someone else's plan looks exactly like a missing one.
    if (!plan) throw new CancelError(404, "PLAN_NOT_FOUND", "Chit plan not found.");

    if (plan.status === "cancelled") {
      return {
        chitPlanId: plan.id,
        planName: plan.name,
        releasedAmount: Number(plan.releasedAmount ?? 0),
        alreadyCancelled: true,
        wallet: null,
      };
    }
    if (plan.status === "completed") {
      throw new CancelError(409, "PLAN_COMPLETED", "This plan is already complete — its savings and bonus are in your wallet.");
    }
    if (plan.isRejected) {
      throw new CancelError(409, "PLAN_REJECTED", "This plan was not approved, so there is nothing to cancel.");
    }

    const released = plan.amountPaid; // exact numeric(10,2) as a string
    let wallet: CancelResult["wallet"] = null;
    if (Number(released) > 0) {
      const [current] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, opts.userId)).for("update");
      if (!current) {
        logger.error("cancel: plan has payments but the customer has no wallet", { chitPlanId: plan.id });
        throw new CancelError(500, "WALLET_INCONSISTENT", "We couldn't release this plan's savings automatically. Please contact support.");
      }
      let updated;
      try {
        [updated] = await tx
          .update(walletsTable)
          .set({
            balance: sql`${walletsTable.balance} + ${released}::numeric`,
            chitLockedBalance: sql`${walletsTable.chitLockedBalance} - ${released}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(walletsTable.userId, opts.userId))
          .returning();
      } catch (err) {
        // wallets_balance_not_negative: the locked balance is lower than what the plan says was paid.
        if (pgErrorCode(err) === "23514") {
          logger.error("cancel: wallet locked balance is lower than the plan's paid amount", {
            chitPlanId: plan.id,
            amountPaid: released,
            lockedBalance: current.chitLockedBalance,
          });
          throw new CancelError(500, "WALLET_INCONSISTENT", "We couldn't release this plan's savings automatically. Please contact support.");
        }
        throw err;
      }
      await tx.insert(transactionsTable).values({
        userId: opts.userId,
        type: "credit",
        amount: released,
        description: `Chit savings released – ${plan.name} (plan cancelled)`,
      });
      wallet = { balance: Number(updated.balance), lockedBalance: Number(updated.chitLockedBalance) };
    }

    await tx
      .update(chitPlansTable)
      .set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: opts.reason, releasedAmount: released })
      .where(eq(chitPlansTable.id, plan.id));

    logger.info("chit plan cancelled", { chitPlanId: plan.id, releasedAmount: released });
    return { chitPlanId: plan.id, planName: plan.name, releasedAmount: Number(released), alreadyCancelled: false, wallet };
  });
}
