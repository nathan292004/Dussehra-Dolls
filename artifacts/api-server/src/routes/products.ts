import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { eq, ilike, or, and } from "drizzle-orm";
import { toRupees } from "../lib/money";

const router = Router();

// Customers see what they can actually buy right now: stock minus units held by other
// customers' unpaid checkouts. (The raw numbers are for the admin only.)
function forCustomer(p: typeof productsTable.$inferSelect) {
  const { reservedStock, ...rest } = p;
  return {
    ...rest,
    stock: Math.max(p.stock - reservedStock, 0),
    price: toRupees(p.price),
    originalPrice: p.originalPrice ? toRupees(p.originalPrice) : undefined,
    rating: p.rating ? parseFloat(p.rating) : 0,
  };
}

router.get("/", async (req, res) => {
  try {
    const { category, search } = req.query as { category?: string; search?: string };
    const conditions = [eq(productsTable.isListed, true)];
    if (category) conditions.push(eq(productsTable.category, category));
    if (search) conditions.push(or(ilike(productsTable.name, `%${search}%`), ilike(productsTable.description ?? "", `%${search}%`))!);
    const products = await db.select().from(productsTable).where(and(...conditions));
    return res.json(products.map(forCustomer));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json(forCustomer(product));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
