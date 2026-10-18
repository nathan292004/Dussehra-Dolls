import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable, transactionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware as any);

router.get("/", async (req: AuthRequest, res) => {
  try {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
    if (!wallet) {
      const [newWallet] = await db.insert(walletsTable).values({ userId: req.userId! }).returning();
      return res.json({ balance: 0, transactions: [] });
    }
    const transactions = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.userId, req.userId!))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50);

    return res.json({
      balance: parseFloat(wallet.balance),
      transactions: transactions.map(t => ({
        ...t,
        amount: parseFloat(t.amount),
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", (_req, res) => res.status(410).json({ error: "Use a verified payment method" }));

export default router;
