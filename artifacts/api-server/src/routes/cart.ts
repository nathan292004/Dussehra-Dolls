import { Router } from "express";
import { db } from "@workspace/db";
import { cartItemsTable, productsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware as any);

async function buildCartResponse(userId: number) {
  const items = await db
    .select({ cartItem: cartItemsTable, product: productsTable })
    .from(cartItemsTable)
    .leftJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.userId, userId));

  const cartItems = items.filter(i => i.product).map(i => {
    const price = parseFloat(i.product!.price);
    const quantity = i.cartItem.quantity;
    return {
      productId: i.cartItem.productId,
      product: {
        ...i.product!,
        price,
        originalPrice: i.product!.originalPrice ? parseFloat(i.product!.originalPrice) : undefined,
        rating: i.product!.rating ? parseFloat(i.product!.rating) : 0,
      },
      quantity,
      subtotal: price * quantity,
    };
  });

  const total = cartItems.reduce((sum, i) => sum + i.subtotal, 0);
  const itemCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  return { items: cartItems, total, itemCount };
}

router.get("/", async (req: AuthRequest, res) => {
  try {
    const cart = await buildCartResponse(req.userId!);
    return res.json(cart);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { productId, quantity } = req.body;
    const existing = await db.select().from(cartItemsTable)
      .where(and(eq(cartItemsTable.userId, req.userId!), eq(cartItemsTable.productId, productId)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(cartItemsTable)
        .set({ quantity: existing[0].quantity + quantity })
        .where(and(eq(cartItemsTable.userId, req.userId!), eq(cartItemsTable.productId, productId)));
    } else {
      await db.insert(cartItemsTable).values({ userId: req.userId!, productId, quantity });
    }

    const cart = await buildCartResponse(req.userId!);
    return res.json(cart);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:productId", async (req: AuthRequest, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const { quantity } = req.body;
    if (quantity <= 0) {
      await db.delete(cartItemsTable)
        .where(and(eq(cartItemsTable.userId, req.userId!), eq(cartItemsTable.productId, productId)));
    } else {
      await db.update(cartItemsTable)
        .set({ quantity })
        .where(and(eq(cartItemsTable.userId, req.userId!), eq(cartItemsTable.productId, productId)));
    }
    const cart = await buildCartResponse(req.userId!);
    return res.json(cart);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:productId", async (req: AuthRequest, res) => {
  try {
    const productId = parseInt(req.params.productId);
    await db.delete(cartItemsTable)
      .where(and(eq(cartItemsTable.userId, req.userId!), eq(cartItemsTable.productId, productId)));
    const cart = await buildCartResponse(req.userId!);
    return res.json(cart);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
