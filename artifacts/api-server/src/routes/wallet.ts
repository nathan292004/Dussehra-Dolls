import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable, transactionsTable } from "@workspace/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth";
import { toRupees } from "../lib/money";
import { readPage } from "../lib/pagination";

const router = Router();
router.use(authMiddleware);

// Wallet money only ever changes through verified payments (top-up via Razorpay, chit
// completion, wallet purchases and refunds), never through a plain "add funds" request.
// ?page=1&pageSize=20 pages through the history, newest first.
router.get("/", async (req, res) => {
  const userId = req.userId!;
  let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
  if (!wallet) {
    [wallet] = await db.insert(walletsTable).values({ userId }).onConflictDoNothing().returning();
    if (!wallet) {
      [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
    }
  }
  const p = readPage(req, 20);
  const [{ total }] = await db.select({ total: count() }).from(transactionsTable).where(eq(transactionsTable.userId, userId));
  const transactions = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt), desc(transactionsTable.id))
    .limit(p.pageSize)
    .offset(p.offset);

  res.json({
    // Money the customer can spend (top-ups, plus chit savings once a plan has completed).
    balance: toRupees(wallet.balance),
    // Money paid into chit plans; becomes spendable when the plan completes.
    lockedBalance: toRupees(wallet.chitLockedBalance),
    // False while a chit plan is still being paid: the wallet cannot be spent until the last payment is made.
    isReleased: wallet.isReleased,
    releasedAt: wallet.releasedAt,
    transactions: transactions.map((t) => ({ ...t, amount: toRupees(t.amount) })),
    page: p.page,
    pageSize: p.pageSize,
    hasMore: p.offset + transactions.length < Number(total),
  });
});

router.post("/", (_req, res) => res.status(410).json({ error: "Use a verified payment method" }));

export default router;
