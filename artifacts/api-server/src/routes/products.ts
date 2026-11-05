import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { toRupees } from "../lib/money";
import { HttpError } from "../lib/http-error";
import { likePattern, pageOf, readPage, readSearch } from "../lib/pagination";
import { parse, idParam } from "../lib/validate";

const router = Router();

// Customers see what they can actually buy right now: stock minus units held by other
// customers' unpaid checkouts. (The raw numbers, and which reseller supplied a doll, are admin-only.)
function forCustomer(p: typeof productsTable.$inferSelect) {
  const { reservedStock, vendorId: _vendorId, ...rest } = p;
  return {
    ...rest,
    stock: Math.max(p.stock - reservedStock, 0),
    price: toRupees(p.price),
    originalPrice: p.originalPrice ? toRupees(p.originalPrice) : undefined,
    rating: p.rating ? parseFloat(p.rating) : 0,
  };
}

// ?category=...&search=...&featured=true&page=1&pageSize=20 — newest first, so pages are stable.
router.get("/", async (req, res) => {
  const p = readPage(req, 20);
  const search = readSearch(req, "search");
  const category = readSearch(req, "category", 60);
  const conditions = [eq(productsTable.isListed, true)];
  if (category && category !== "All") conditions.push(eq(productsTable.category, category));
  if (req.query.featured === "true") conditions.push(eq(productsTable.isFeatured, true));
  if (search) {
    const like = likePattern(search);
    conditions.push(or(ilike(productsTable.name, like), ilike(productsTable.description, like))!);
  }
  const where = and(...conditions);
  const [products, [{ total }]] = await Promise.all([
    db.select().from(productsTable).where(where)
      .orderBy(desc(productsTable.isFeatured), desc(productsTable.createdAt), desc(productsTable.id))
      .limit(p.pageSize).offset(p.offset),
    db.select({ total: count() }).from(productsTable).where(where),
  ]);
  res.json(pageOf(products.map(forCustomer), Number(total), p));
});

router.get("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const [product] = await db.select().from(productsTable).where(and(eq(productsTable.id, id), eq(productsTable.isListed, true))).limit(1);
  if (!product) throw new HttpError(404, "Product not found");
  res.json(forCustomer(product));
});

export default router;
