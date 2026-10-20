import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable, transactionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { toRupees } from "../lib/money";

const router = Router();
router.use(authMiddleware as any);

// Wallet money only ever changes through verified payments (top-up via Razorpay, chit
// completion, wallet purchases and refunds), never through a plain "add funds" request.
router.get("/", async (req: AuthRequest, res) => {
  try {
    let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
    if (!wallet) {
      [wallet] = await db
        .insert(walletsTable)
        .values({ userId: req.userId! })
        .onConflictDoNothing()
        .returning();
      if (!wallet) {
        [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
      }
    }
    const transactions = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.userId, req.userId!))
      .orderBy(desc(transactionsTable.createdAt), desc(transactionsTable.id))
      .limit(50);

    return res.json({
      // Money the customer can spend now (top-ups, plus chit savings once a plan has completed).
      balance: toRupees(wallet.balance),
      // Money paid into chit plans; becomes spendable when the plan completes.
      lockedBalance: toRupees(wallet.chitLockedBalance),
      transactions: transactions.map(t => ({ ...t, amount: toRupees(t.amount) })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
