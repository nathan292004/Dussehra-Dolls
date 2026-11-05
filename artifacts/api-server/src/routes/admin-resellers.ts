import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, resellerStockEntriesTable, vendorsTable } from "@workspace/db/schema";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { HttpError } from "../lib/http-error";
import { likePattern, pageOf, readPage, readSearch } from "../lib/pagination";
import { z, parse, idParam, text, optionalText, emailField } from "../lib/validate";
import { normalizePhone } from "../lib/phone";

// Resellers hand their dolls to us and we sell them through the app (consignment). This tracks,
// per reseller: what they supplied, what they took back, what is on the shelf, what sold and for
// how much — plus store-wide insights. Payouts are handled outside the system for now.
//
// "Sold" = units in PAID orders for products currently linked to the reseller (unpaid, cancelled
// and refunded orders don't count). Mounted at /api/admin/resellers (admin login required, see routes/index.ts).

const router = Router();

// ─── helpers ──────────────────────────────────────────────────────────────────
async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const resellerFields = {
  name: text("Name", 1, 120),
  contact: optionalText("Contact person", 120),
  email: z.preprocess(blankToNull, emailField.nullable()),
  phone: z.preprocess(blankToNull, z.string().trim().transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) { ctx.addIssue({ code: "custom", message: "Phone doesn't look right" }); return z.NEVER; }
    return normalized;
  }).nullable()),
  address: optionalText("Address", 300),
  notes: optionalText("Notes", 1000),
  isActive: z.boolean({ invalid_type_error: "isActive must be true or false" }),
};

const createSchema = z.object({
  name: resellerFields.name,
  contact: resellerFields.contact.optional().default(null),
  email: resellerFields.email.optional().default(null),
  phone: resellerFields.phone.optional().default(null),
  address: resellerFields.address.optional().default(null),
  notes: resellerFields.notes.optional().default(null),
});

const updateSchema = z.object({
  name: resellerFields.name.optional(),
  contact: resellerFields.contact.optional(),
  email: resellerFields.email.optional(),
  phone: resellerFields.phone.optional(),
  address: resellerFields.address.optional(),
  notes: resellerFields.notes.optional(),
  isActive: resellerFields.isActive.optional(),
});

interface ResellerMetrics {
  products: number;
  unitsReceived: number;
  unitsReturned: number;
  unitsInStock: number;
  unitsAvailable: number;
  unitsSold: number;
  revenue: number;
  lastSaleAt: string | null;
  /** % of the units they handed over (net of returns) that have sold. null if nothing logged yet. */
  sellThrough: number | null;
  /** received - returned - sold - in stock. Non-zero = stock was changed outside the reseller records. */
  stockDifference: number;
}

const emptyMetrics = (): ResellerMetrics => ({
  products: 0, unitsReceived: 0, unitsReturned: 0, unitsInStock: 0, unitsAvailable: 0,
  unitsSold: 0, revenue: 0, lastSaleAt: null, sellThrough: null, stockDifference: 0,
});

/** Sales per reseller from paid orders. Order items are JSON, so each line is unpacked here. */
function salesByReseller(resellerIds?: number[]) {
  return rows<{ vendor_id: number; units: number; revenue: string; last_sale: Date | null }>(sql`
    select p.vendor_id, sum((it->>'quantity')::int)::int as units,
           coalesce(sum((it->>'subtotal')::numeric), 0) as revenue, max(o.created_at) as last_sale
    from orders o
    cross join lateral jsonb_array_elements(o.items) it
    join products p on p.id = (it->>'productId')::int
    where o.payment_status = 'paid' and p.vendor_id is not null
      ${resellerIds?.length ? sql`and p.vendor_id in ${resellerIds}` : sql``}
    group by p.vendor_id`);
}

async function metricsFor(resellerIds: number[]): Promise<Map<number, ResellerMetrics>> {
  const out = new Map(resellerIds.map((id) => [id, emptyMetrics()]));
  if (!resellerIds.length) return out;
  const [stock, intake, sales] = await Promise.all([
    rows<{ vendor_id: number; products: number; in_stock: number; available: number }>(sql`
      select vendor_id, count(*)::int as products, coalesce(sum(stock), 0)::int as in_stock,
             coalesce(sum(greatest(stock - reserved_stock, 0)), 0)::int as available
      from products where vendor_id in ${resellerIds} group by vendor_id`),
    rows<{ vendor_id: number; received: number; returned: number }>(sql`
      select vendor_id,
             coalesce(sum(quantity) filter (where kind = 'received'), 0)::int as received,
             coalesce(sum(quantity) filter (where kind = 'returned'), 0)::int as returned
      from reseller_stock_entries where vendor_id in ${resellerIds} group by vendor_id`),
    salesByReseller(resellerIds),
  ]);
  for (const r of stock) Object.assign(out.get(r.vendor_id)!, { products: r.products, unitsInStock: r.in_stock, unitsAvailable: r.available });
  for (const r of intake) Object.assign(out.get(r.vendor_id)!, { unitsReceived: r.received, unitsReturned: r.returned });
  for (const r of sales) {
    Object.assign(out.get(r.vendor_id)!, {
      unitsSold: r.units, revenue: Number(r.revenue), lastSaleAt: r.last_sale ? new Date(r.last_sale).toISOString() : null,
    });
  }
  for (const m of out.values()) {
    const net = m.unitsReceived - m.unitsReturned;
    m.sellThrough = net > 0 ? Math.round((m.unitsSold / net) * 1000) / 10 : null;
    m.stockDifference = net - m.unitsSold - m.unitsInStock;
  }
  return out;
}

async function loadReseller(id: number) {
  const [reseller] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!reseller) throw new HttpError(404, "Reseller not found");
  return reseller;
}

// ─── list ─────────────────────────────────────────────────────────────────────
const listQuery = z.object({ status: z.enum(["active", "inactive"]).optional() });

// ?page&pageSize&q=<name / contact / phone>&status=<active|inactive>
router.get("/", async (req, res) => {
  const p = readPage(req);
  const q = readSearch(req);
  const f = parse(listQuery, req.query);
  const filters: SQL[] = [];
  if (q) filters.push(or(ilike(vendorsTable.name, likePattern(q)), ilike(vendorsTable.contact, likePattern(q)), ilike(vendorsTable.phone, likePattern(q)))!);
  if (f.status === "active") filters.push(eq(vendorsTable.isActive, true));
  if (f.status === "inactive") filters.push(eq(vendorsTable.isActive, false));
  const where = filters.length ? and(...filters) : undefined;
  const [list, [{ total }]] = await Promise.all([
    db.select().from(vendorsTable).where(where)
      .orderBy(desc(vendorsTable.isActive), vendorsTable.name, vendorsTable.id)
      .limit(p.pageSize).offset(p.offset),
    db.select({ total: count() }).from(vendorsTable).where(where),
  ]);
  const metrics = await metricsFor(list.map((r) => r.id));
  res.json(pageOf(list.map((r) => ({ ...r, metrics: metrics.get(r.id)! })), Number(total), p));
});

// ─── store-wide insights ────────────────────────────────────────────────────────
router.get("/insights", async (_req, res) => {
  const [[resellerCounts], stockTotals, [storeRevenue], monthly, slowMovers, restock] = await Promise.all([
    db.select({
      active: sql<number>`count(*) filter (where ${vendorsTable.isActive})::int`,
      total: sql<number>`count(*)::int`,
    }).from(vendorsTable),
    rows<{ products: number; in_stock: number }>(sql`
      select count(*)::int as products, coalesce(sum(stock), 0)::int as in_stock from products where vendor_id is not null`),
    // Store revenue split: reseller-supplied dolls vs our own stock, all time and last 30 days.
    rows<{ reseller_total: string; own_total: string; reseller_30d: string; own_30d: string; reseller_units: number; own_units: number }>(sql`
      select coalesce(sum((it->>'subtotal')::numeric) filter (where p.vendor_id is not null), 0) as reseller_total,
             coalesce(sum((it->>'subtotal')::numeric) filter (where p.vendor_id is null), 0) as own_total,
             coalesce(sum((it->>'subtotal')::numeric) filter (where p.vendor_id is not null and o.created_at > now() - interval '30 days'), 0) as reseller_30d,
             coalesce(sum((it->>'subtotal')::numeric) filter (where p.vendor_id is null and o.created_at > now() - interval '30 days'), 0) as own_30d,
             coalesce(sum((it->>'quantity')::int) filter (where p.vendor_id is not null), 0)::int as reseller_units,
             coalesce(sum((it->>'quantity')::int) filter (where p.vendor_id is null), 0)::int as own_units
      from orders o cross join lateral jsonb_array_elements(o.items) it
      left join products p on p.id = (it->>'productId')::int
      where o.payment_status = 'paid'`),
    // Units and revenue per reseller per month, last 6 months (for the trend chart).
    rows<{ month: string; vendor_id: number; name: string; units: number; revenue: string }>(sql`
      select to_char(date_trunc('month', o.created_at), 'YYYY-MM') as month, v.id as vendor_id, v.name,
             sum((it->>'quantity')::int)::int as units, coalesce(sum((it->>'subtotal')::numeric), 0) as revenue
      from orders o cross join lateral jsonb_array_elements(o.items) it
      join products p on p.id = (it->>'productId')::int
      join vendors v on v.id = p.vendor_id
      where o.payment_status = 'paid' and o.created_at >= date_trunc('month', now()) - interval '5 months'
      group by 1, 2, 3 order by 1`),
    // On the shelf but nothing sold in the last 30 days: candidates to promote or return.
    rows<{ product_id: number; product_name: string; vendor_id: number; reseller_name: string; available: number; last_sale: Date | null; added_at: Date }>(sql`
      select p.id as product_id, p.name as product_name, v.id as vendor_id, v.name as reseller_name,
             greatest(p.stock - p.reserved_stock, 0) as available, s.last_sale, p.created_at as added_at
      from products p join vendors v on v.id = p.vendor_id
      left join lateral (
        select max(o.created_at) as last_sale from orders o cross join lateral jsonb_array_elements(o.items) it
        where o.payment_status = 'paid' and (it->>'productId')::int = p.id
      ) s on true
      where p.stock - p.reserved_stock > 0 and (s.last_sale is null or s.last_sale < now() - interval '30 days')
        and p.created_at < now() - interval '30 days'
      order by s.last_sale nulls first, p.created_at limit 20`),
    // Selling but nearly out: ask the reseller for more.
    rows<{ product_id: number; product_name: string; vendor_id: number; reseller_name: string; available: number }>(sql`
      select p.id as product_id, p.name as product_name, v.id as vendor_id, v.name as reseller_name,
             greatest(p.stock - p.reserved_stock, 0) as available
      from products p join vendors v on v.id = p.vendor_id
      where v.is_active and p.is_listed and p.stock - p.reserved_stock < 3
      order by available, p.name limit 20`),
  ]);

  const allIds = (await db.select({ id: vendorsTable.id }).from(vendorsTable)).map((r) => r.id);
  const metrics = await metricsFor(allIds);
  const names = new Map((await db.select({ id: vendorsTable.id, name: vendorsTable.name, isActive: vendorsTable.isActive }).from(vendorsTable)).map((r) => [r.id, r]));
  const leaderboard = [...metrics.entries()]
    .map(([id, m]) => ({ id, name: names.get(id)!.name, isActive: names.get(id)!.isActive, ...m }))
    .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue || a.name.localeCompare(b.name))
    .slice(0, 10);

  const rev = storeRevenue ?? { reseller_total: "0", own_total: "0", reseller_30d: "0", own_30d: "0", reseller_units: 0, own_units: 0 };
  const resellerTotal = Number(rev.reseller_total), ownTotal = Number(rev.own_total);
  res.json({
    resellers: resellerCounts,
    totals: {
      products: stockTotals[0]?.products ?? 0,
      unitsInStock: stockTotals[0]?.in_stock ?? 0,
      unitsSold: rev.reseller_units,
      revenue: resellerTotal,
      revenueLast30d: Number(rev.reseller_30d),
      // How much of the store's sales comes from reseller dolls.
      shareOfStoreRevenue: resellerTotal + ownTotal > 0 ? Math.round((resellerTotal / (resellerTotal + ownTotal)) * 1000) / 10 : null,
      ownStock: { unitsSold: rev.own_units, revenue: ownTotal, revenueLast30d: Number(rev.own_30d) },
    },
    leaderboard,
    monthly: monthly.map((m) => ({ month: m.month, resellerId: m.vendor_id, name: m.name, units: m.units, revenue: Number(m.revenue) })),
    slowMovers: slowMovers.map((r) => ({
      productId: r.product_id, productName: r.product_name, resellerId: r.vendor_id, resellerName: r.reseller_name,
      available: r.available, lastSaleAt: r.last_sale ? new Date(r.last_sale).toISOString() : null, addedAt: new Date(r.added_at).toISOString(),
    })),
    restock: restock.map((r) => ({ productId: r.product_id, productName: r.product_name, resellerId: r.vendor_id, resellerName: r.reseller_name, available: r.available })),
  });
});

// ─── one reseller ─────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const reseller = await loadReseller(id);
  const [metrics, products, monthly] = await Promise.all([
    metricsFor([id]),
    rows<{ id: number; name: string; category: string; image_url: string | null; price: string; stock: number; reserved_stock: number; is_listed: boolean; received: number; returned: number; sold: number; revenue: string; last_sale: Date | null }>(sql`
      select p.id, p.name, p.category, p.image_url, p.price, p.stock, p.reserved_stock, p.is_listed,
             coalesce(e.received, 0)::int as received, coalesce(e.returned, 0)::int as returned,
             coalesce(s.sold, 0)::int as sold, coalesce(s.revenue, 0) as revenue, s.last_sale
      from products p
      left join (
        select product_id, sum(quantity) filter (where kind = 'received') as received, sum(quantity) filter (where kind = 'returned') as returned
        from reseller_stock_entries where vendor_id = ${id} group by product_id
      ) e on e.product_id = p.id
      left join (
        select (it->>'productId')::int as product_id, sum((it->>'quantity')::int) as sold,
               sum((it->>'subtotal')::numeric) as revenue, max(o.created_at) as last_sale
        from orders o cross join lateral jsonb_array_elements(o.items) it
        where o.payment_status = 'paid' group by 1
      ) s on s.product_id = p.id
      where p.vendor_id = ${id}
      order by sold desc nulls last, p.name`),
    rows<{ month: string; units: number; revenue: string }>(sql`
      select to_char(date_trunc('month', o.created_at), 'YYYY-MM') as month,
             sum((it->>'quantity')::int)::int as units, coalesce(sum((it->>'subtotal')::numeric), 0) as revenue
      from orders o cross join lateral jsonb_array_elements(o.items) it
      join products p on p.id = (it->>'productId')::int
      where o.payment_status = 'paid' and p.vendor_id = ${id} and o.created_at >= date_trunc('month', now()) - interval '11 months'
      group by 1 order by 1`),
  ]);
  res.json({
    ...reseller,
    metrics: metrics.get(id)!,
    products: products.map((p) => ({
      id: p.id, name: p.name, category: p.category, imageUrl: p.image_url, price: Number(p.price), isListed: p.is_listed,
      stock: p.stock, available: Math.max(p.stock - p.reserved_stock, 0),
      unitsReceived: p.received, unitsReturned: p.returned, unitsSold: p.sold, revenue: Number(p.revenue),
      lastSaleAt: p.last_sale ? new Date(p.last_sale).toISOString() : null,
    })),
    monthly: monthly.map((m) => ({ month: m.month, units: m.units, revenue: Number(m.revenue) })),
  });
});

router.get("/:id/stock-entries", async (req, res) => {
  const id = parse(idParam, req.params.id);
  await loadReseller(id);
  const p = readPage(req);
  const where = eq(resellerStockEntriesTable.vendorId, id);
  const [entries, [{ total }]] = await Promise.all([
    db.select().from(resellerStockEntriesTable).where(where)
      .orderBy(desc(resellerStockEntriesTable.createdAt), desc(resellerStockEntriesTable.id))
      .limit(p.pageSize).offset(p.offset),
    db.select({ total: count() }).from(resellerStockEntriesTable).where(where),
  ]);
  res.json(pageOf(entries, Number(total), p));
});

// ─── create / update / delete ─────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const d = parse(createSchema, req.body);
  const [created] = await db.insert(vendorsTable).values(d).returning();
  res.status(201).json({ ...created, metrics: emptyMetrics() });
});

router.put("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const d = parse(updateSchema, req.body);
  if (!Object.keys(d).length) throw new HttpError(400, "Nothing to update");
  const [updated] = await db.update(vendorsTable).set({ ...d, updatedAt: new Date() }).where(eq(vendorsTable.id, id)).returning();
  if (!updated) throw new HttpError(404, "Reseller not found");
  res.json(updated);
});

// Only a reseller with no products and no stock history can be deleted; otherwise deactivate them,
// so the sales history and analytics stay intact.
router.delete("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  await loadReseller(id);
  const [[{ products }], [{ entries }]] = await Promise.all([
    db.select({ products: count() }).from(productsTable).where(eq(productsTable.vendorId, id)),
    db.select({ entries: count() }).from(resellerStockEntriesTable).where(eq(resellerStockEntriesTable.vendorId, id)),
  ]);
  if (Number(products) > 0 || Number(entries) > 0) {
    throw new HttpError(409, "This reseller has products or stock history, so they can't be deleted. Deactivate them instead.", "RESELLER_HAS_HISTORY");
  }
  await db.delete(vendorsTable).where(eq(vendorsTable.id, id));
  res.json({ success: true });
});

// ─── stock handed over / taken back ───────────────────────────────────────────
const stockSchema = z.object({
  productId: z.coerce.number().int().min(1),
  kind: z.enum(["received", "returned"], { errorMap: () => ({ message: 'kind must be "received" or "returned"' }) }),
  quantity: z.coerce.number().int().min(1, "Quantity must be a whole number from 1 to 100000").max(100_000, "Quantity must be a whole number from 1 to 100000"),
  note: optionalText("Note", 300).optional().default(null),
});

// Body: { productId, kind: "received" | "returned", quantity, note? }. Moves products.stock in the
// same transaction. A product with no reseller is linked to this one on its first "received".
router.post("/:id/stock", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const { productId, kind, quantity, note } = parse(stockSchema, req.body);

  const result = await db.transaction(async (tx) => {
    const [reseller] = await tx.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
    if (!reseller) throw new HttpError(404, "Reseller not found");
    if (!reseller.isActive && kind === "received") throw new HttpError(409, "This reseller is deactivated. Reactivate them to record new stock.", "RESELLER_INACTIVE");
    const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, productId)).for("update");
    if (!product) throw new HttpError(404, "Product not found");
    if (product.vendorId !== null && product.vendorId !== id) {
      throw new HttpError(409, "That product belongs to a different reseller.", "PRODUCT_OTHER_RESELLER");
    }
    if (product.vendorId === null && kind === "returned") {
      throw new HttpError(409, "That product isn't linked to this reseller, so nothing can be returned to them.", "PRODUCT_NOT_LINKED");
    }
    if (kind === "returned" && product.stock - product.reservedStock < quantity) {
      throw new HttpError(
        409,
        `Only ${Math.max(product.stock - product.reservedStock, 0)} unit(s) can be returned right now (the rest are sold or held by customers who are paying).`,
        "NOT_ENOUGH_STOCK",
      );
    }
    const delta = kind === "received" ? quantity : -quantity;
    const [updated] = await tx.update(productsTable)
      .set({ stock: sql`${productsTable.stock} + ${delta}`, vendorId: id, updatedAt: new Date() })
      .where(eq(productsTable.id, productId))
      .returning();
    const [entry] = await tx.insert(resellerStockEntriesTable).values({
      vendorId: id, productId, productName: product.name, kind, quantity, note, createdBy: req.adminId ?? null,
    }).returning();
    return { entry, stock: updated.stock, available: Math.max(updated.stock - updated.reservedStock, 0) };
  });
  res.status(201).json(result);
});

export default router;
