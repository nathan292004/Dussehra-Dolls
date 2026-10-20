import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { fromPaise, toPaise } from "../lib/money";

const router = Router();
router.use(authMiddleware as any);

// Orders are created only by the payment routes (wallet and/or Razorpay), after the money
// is secured. There is deliberately no "create order" endpoint here.
function formatOrder(o: typeof ordersTable.$inferSelect) {
  const total = toPaise(o.total);
  const wallet = toPaise(o.walletAmount);
  return {
    ...o,
    total: fromPaise(total),
    walletAmount: fromPaise(wallet),
    onlineAmount: fromPaise(total - wallet),
  };
}

router.get("/", async (req: AuthRequest, res) => {
  try {
    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.userId, req.userId!))
      .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id));
    // Orders still waiting for payment or cancelled before payment are not shown as purchases.
    return res.json(orders.filter(o => o.paymentStatus === "paid").map(formatOrder));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(404).json({ error: "Order not found" });
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, req.userId!)))
      .limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    return res.json(formatOrder(order));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
