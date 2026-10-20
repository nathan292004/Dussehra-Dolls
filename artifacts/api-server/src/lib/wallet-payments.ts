import { db } from "@workspace/db";
import { walletsTable, transactionsTable, usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { fromPaise, paiseToDecimal, toPaise } from "./money";
import { notifyWalletTopUp } from "./whatsapp-notifications";

/**
 * Credits a verified Razorpay wallet top-up. Safe to call twice for the same payment
 * (app verify + webhook): the second call changes nothing.
 */
export async function applyWalletTopUp(opts: { userId: string; razorpayPaymentId: string; amountPaise: number }) {
  if (!Number.isSafeInteger(opts.amountPaise) || opts.amountPaise <= 0) {
    throw new Error("Invalid top-up amount");
  }
  const applied = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${opts.razorpayPaymentId}))`);
    const [previous] = await tx
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(eq(transactionsTable.razorpayPaymentId, opts.razorpayPaymentId))
      .limit(1);
    if (previous) return false;
    await tx
      .insert(walletsTable)
      .values({ userId: opts.userId, balance: paiseToDecimal(opts.amountPaise) })
      .onConflictDoUpdate({
        target: walletsTable.userId,
        set: { balance: sql`${walletsTable.balance} + ${paiseToDecimal(opts.amountPaise)}::numeric`, updatedAt: new Date() },
      });
    await tx.insert(transactionsTable).values({
      userId: opts.userId,
      type: "credit",
      amount: paiseToDecimal(opts.amountPaise),
      razorpayPaymentId: opts.razorpayPaymentId,
      description: `Wallet top-up via Razorpay (${opts.razorpayPaymentId})`,
    });
    return true;
  });

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, opts.userId)).limit(1);
  const newBalance = fromPaise(toPaise(wallet?.balance ?? "0"));
  if (applied) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, opts.userId)).limit(1);
    if (user?.phone) {
      notifyWalletTopUp({
        phone: user.phone,
        name: [user.fname, user.lname].filter(Boolean).join(" ") || "Customer",
        userId: user.userId,
        credited: fromPaise(opts.amountPaise),
        newBalance,
      }).catch((e) => console.error("[WhatsApp] Wallet notify failed:", e));
    }
  }
  return { applied, newBalance };
}
