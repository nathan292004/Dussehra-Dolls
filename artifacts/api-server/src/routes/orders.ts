import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, cartItemsTable, productsTable, walletsTable, transactionsTable } from "@workspace/db/schema";
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

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { address, paymentMethod } = req.body;
    const cartItems = await db
      .select({ cartItem: cartItemsTable, product: productsTable })
      .from(cartItemsTable)
      .leftJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
      .where(eq(cartItemsTable.userId, req.userId!));

    if (cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const orderItems = cartItems.filter(i => i.product).map(i => ({
      productId: i.cartItem.productId,
      productName: i.product!.name,
      quantity: i.cartItem.quantity,
      price: parseFloat(i.product!.price),
      subtotal: parseFloat(i.product!.price) * i.cartItem.quantity,
    }));

    const total = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

    const [order] = await db.insert(ordersTable).values({
      userId: req.userId!,
      items: orderItems,
      total: total.toFixed(2),
      address,
      paymentMethod,
      status: "confirmed",
    }).returning();

    await db.delete(cartItemsTable).where(eq(cartItemsTable.userId, req.userId!));

    await db.insert(transactionsTable).values({
      userId: req.userId!,
      type: "debit",
      amount: total.toFixed(2),
      description: `Order #${order.id}`,
    });

    return res.status(201).json({ ...order, total: parseFloat(order.total) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
