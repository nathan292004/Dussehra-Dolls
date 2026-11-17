import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, usersTable } from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { fromPaise, toPaise } from "../lib/money";
import { generateOrderInvoicePdf } from "../lib/document-generator";
import { parsePaginationParams, formatListResponse } from "../lib/pagination";

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

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const pagination = parsePaginationParams(req.query);
    const whereClause = and(eq(ordersTable.userId, req.userId!), eq(ordersTable.paymentStatus, "paid"));

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(whereClause);

    let query = db
      .select()
      .from(ordersTable)
      .where(whereClause)
      .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id));

    if (pagination.isPaginatedRequest) {
      query = query.limit(pagination.limit).offset(pagination.offset) as any;
    }

    const orders = await query;
    return formatListResponse(res, orders.map(formatOrder), total, pagination);
  } catch (err) {
    next(err);
    return;
  }
});

router.get("/:id", async (req: AuthRequest, res, next) => {
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
    next(err);
    return;
  }
});

router.get("/:id/invoice", async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(404).json({ error: "Order not found" });
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, req.userId!)))
      .limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, req.userId!)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    const formatted = formatOrder(order);
    const pdfBuffer = await generateOrderInvoicePdf(formatted, {
      userId: user.userId,
      fname: user.fname,
      lname: user.lname,
      phone: user.phone,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-ORD-${order.id}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    next(err);
    return;
  }
});

export default router;
