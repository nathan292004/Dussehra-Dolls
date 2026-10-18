import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware as any);

router.get("/", async (req: AuthRequest, res) => {
  try {
    const orders = await db.select().from(ordersTable).where(eq(ordersTable.userId, req.userId!));
    return res.json(orders.map(o => ({ ...o, total: parseFloat(o.total) })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order || order.userId !== req.userId) return res.status(404).json({ error: "Order not found" });
    return res.json({ ...order, total: parseFloat(order.total) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", (_req, res) => res.status(410).json({ error: "Use a verified checkout method" }));

export default router;
