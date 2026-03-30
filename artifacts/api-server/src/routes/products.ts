import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { eq, ilike, or, and } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { category, search } = req.query as { category?: string; search?: string };
    const conditions = [eq(productsTable.isListed, true)];
    if (category) conditions.push(eq(productsTable.category, category));
    if (search) conditions.push(or(ilike(productsTable.name, `%${search}%`), ilike(productsTable.description ?? "", `%${search}%`))!);
    const products = await db.select().from(productsTable).where(and(...conditions));
    return res.json(products.map(p => ({
      ...p,
      price: parseFloat(p.price),
      originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
      rating: p.rating ? parseFloat(p.rating) : 0,
    })));
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
    return res.json({
      ...product,
      price: parseFloat(product.price),
      originalPrice: product.originalPrice ? parseFloat(product.originalPrice) : undefined,
      rating: product.rating ? parseFloat(product.rating) : 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
