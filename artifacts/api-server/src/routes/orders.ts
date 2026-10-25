import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth";
import { fromPaise, toPaise } from "../lib/money";
import { readPage } from "../lib/pagination";
import { HttpError } from "../lib/http-error";
import { parse, idParam } from "../lib/validate";

const router = Router();
router.use(authMiddleware);

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

// ?page=1&pageSize=20, newest first. Orders still waiting for payment or cancelled before payment are
// not shown as purchases.
router.get("/", async (req, res) => {
  const p = readPage(req, 20);
  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.userId, req.userId!), eq(ordersTable.paymentStatus, "paid")))
    .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id))
    .limit(p.pageSize)
    .offset(p.offset);
  res.json(orders.map(formatOrder));
});

router.get("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, req.userId!)))
    .limit(1);
  if (!order) throw new HttpError(404, "Order not found");
  res.json(formatOrder(order));
});

export default router;
