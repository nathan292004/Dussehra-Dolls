import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { eq, ilike, or, and, sql } from "drizzle-orm";
import { toRupees } from "../lib/money";
import { parsePaginationParams, formatListResponse } from "../lib/pagination";

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

router.get("/", async (req, res, next) => {
  try {
    const { category, search } = req.query as { category?: string; search?: string };
    const pagination = parsePaginationParams(req.query);

    const conditions = [eq(productsTable.isListed, true)];
    if (category) conditions.push(eq(productsTable.category, category));
    if (search) conditions.push(or(ilike(productsTable.name, `%${search}%`), ilike(productsTable.description ?? "", `%${search}%`))!);

    const whereClause = and(...conditions);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(productsTable)
      .where(whereClause);

    let query = db.select().from(productsTable).where(whereClause).orderBy(productsTable.id);
    if (pagination.isPaginatedRequest) {
      query = query.limit(pagination.limit).offset(pagination.offset) as any;
    }
    const products = await query;
    return formatListResponse(res, products.map(forCustomer), total, pagination);
  } catch (err) {
    next(err);
    return;
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json(forCustomer(product));
  } catch (err) {
    next(err);
    return;
  }
});

export default router;
