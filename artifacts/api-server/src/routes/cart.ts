import { Router } from "express";
import { db } from "@workspace/db";
import { cartItemsTable, productsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { fromPaise, sumPaise, toRupees } from "../lib/money";
import { loadCartLines } from "../lib/cart-lines";

const router = Router();
router.use(authMiddleware);

const MAX_QUANTITY = 99;

async function buildCartResponse(userId: string) {
  const lines = await loadCartLines(userId);
  const items = lines.map(l => ({
    productId: l.productId,
    product: {
      ...l.product,
      // What can be bought right now (stock minus units held by other unpaid checkouts).
      stock: Math.max(l.product.stock - l.product.reservedStock, 0),
      price: fromPaise(l.pricePaise),
      originalPrice: l.product.originalPrice ? toRupees(l.product.originalPrice) : undefined,
      rating: l.product.rating ? parseFloat(l.product.rating) : 0,
    },
    quantity: l.quantity,
    subtotal: fromPaise(l.subtotalPaise),
  }));
  return {
    items,
    total: fromPaise(sumPaise(lines.map(l => l.subtotalPaise))),
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

const isWholeNumber = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

router.get("/", async (req, res) => {
  try {
    return res.json(await buildCartResponse(req.userId!));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { productId, quantity } = req.body ?? {};
    if (!isWholeNumber(productId, 1, 2_147_483_647) || !isWholeNumber(quantity, 1, MAX_QUANTITY)) {
      return res.status(400).json({ error: "productId and a quantity from 1 to 99 are required" });
    }
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!product || !product.isListed) return res.status(404).json({ error: "Product not found" });

    // One row per customer and product (database rule), so adding twice at the same moment is safe.
    await db.insert(cartItemsTable)
      .values({ userId: req.userId!, productId, quantity })
      .onConflictDoUpdate({
        target: [cartItemsTable.userId, cartItemsTable.productId],
        set: { quantity: sql`LEAST(${MAX_QUANTITY}, ${cartItemsTable.quantity} + ${quantity})` },
      });
    return res.json(await buildCartResponse(req.userId!));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:productId", async (req, res) => {
  try {
    const productId = parseInt(String(req.params.productId), 10);
    const { quantity } = req.body ?? {};
    if (!Number.isInteger(productId) || !isWholeNumber(quantity, 0, MAX_QUANTITY)) {
      return res.status(400).json({ error: "A quantity from 0 to 99 is required" });
    }
    if (quantity === 0) {
      await db.delete(cartItemsTable)
        .where(and(eq(cartItemsTable.userId, req.userId!), eq(cartItemsTable.productId, productId)));
    } else {
      await db.update(cartItemsTable)
        .set({ quantity })
        .where(and(eq(cartItemsTable.userId, req.userId!), eq(cartItemsTable.productId, productId)));
    }
    return res.json(await buildCartResponse(req.userId!));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:productId", async (req, res) => {
  try {
    const productId = parseInt(String(req.params.productId), 10);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: "Invalid product" });
    await db.delete(cartItemsTable)
      .where(and(eq(cartItemsTable.userId, req.userId!), eq(cartItemsTable.productId, productId)));
    return res.json(await buildCartResponse(req.userId!));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
