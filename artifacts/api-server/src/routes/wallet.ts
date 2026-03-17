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

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
    const currentBalance = wallet ? parseFloat(wallet.balance) : 0;
    const newBalance = currentBalance + amount;

    if (wallet) {
      await db.update(walletsTable)
        .set({ balance: newBalance.toFixed(2) })
        .where(eq(walletsTable.userId, req.userId!));
    } else {
      await db.insert(walletsTable).values({ userId: req.userId!, balance: newBalance.toFixed(2) });
    }

    await db.insert(transactionsTable).values({
      userId: req.userId!,
      type: "credit",
      amount: amount.toFixed(2),
      description: "Funds added",
    });

    const transactions = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.userId, req.userId!))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50);

    return res.json({
      balance: newBalance,
      transactions: transactions.map(t => ({ ...t, amount: parseFloat(t.amount) })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
