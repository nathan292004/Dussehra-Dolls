import { Router } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { ordersTable, usersTable } from "@workspace/db/schema";
import { HttpError } from "../lib/http-error";
import { likePattern, pageOf, readPage, readSearch } from "../lib/pagination";
import { z, parse, idParam } from "../lib/validate";
import { toRupees } from "../lib/money";

// Mounted at /api/admin/orders (admin login required, see routes/index.ts).
const router = Router();

const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"] as const;
const PAYMENT_STATUSES = ["pending", "paid", "cancelled", "failed", "refunded"] as const;

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must look like 2026-10-31")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Date is not valid");

const listQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  // Whole days in Indian time, inclusive: ?from=2026-10-01&to=2026-10-31
  from: isoDay.optional(),
  to: isoDay.optional(),
});

const statusBody = z
  .object({ status: z.enum(ORDER_STATUSES, { errorMap: () => ({ message: "Invalid status" }) }) })
  .strict("Only the order status can be changed here; payment status is controlled by verified payments");

const customerName = sql<string>`concat_ws(' ', ${usersTable.fname}, ${usersTable.lname})`;

// ?page=1&pageSize=25&q=customer name, phone, address or order number&status=shipped&paymentStatus=paid
router.get("/", async (req, res) => {
  const p = readPage(req);
  const q = readSearch(req);
  const f = parse(listQuery, req.query);
  const conditions = [];
  if (f.status) conditions.push(eq(ordersTable.status, f.status));
  if (f.paymentStatus) conditions.push(eq(ordersTable.paymentStatus, f.paymentStatus));
  if (f.from) conditions.push(sql`${ordersTable.createdAt} >= (${f.from}::date)::timestamp AT TIME ZONE 'Asia/Kolkata'`);
  if (f.to) conditions.push(sql`${ordersTable.createdAt} < ((${f.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`);
  if (q) {
    const like = likePattern(q);
    conditions.push(
      sql`(${customerName} ilike ${like} or ${usersTable.phone} ilike ${like} or ${ordersTable.userId} ilike ${like} or ${ordersTable.address} ilike ${like} or ${ordersTable.id}::text = ${q.replace(/^#/, "")})`,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.userId))
    .where(where);

  const rows = await db
    .select({
      id: ordersTable.id,
      userId: ordersTable.userId,
      total: ordersTable.total,
      walletAmount: ordersTable.walletAmount,
      status: ordersTable.status,
      paymentStatus: ordersTable.paymentStatus,
      paymentMethod: ordersTable.paymentMethod,
      address: ordersTable.address,
      addressLink: ordersTable.addressLink,
      addressLatitude: ordersTable.addressLatitude,
      addressLongitude: ordersTable.addressLongitude,
      items: ordersTable.items,
      createdAt: ordersTable.createdAt,
      customerName,
      customerPhone: usersTable.phone,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.userId))
    .where(where)
    .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id))
    .limit(p.pageSize)
    .offset(p.offset);

  res.json(
    pageOf(
      rows.map((o) => ({
        ...o,
        total: toRupees(o.total),
        walletAmount: toRupees(o.walletAmount),
        customerName: o.customerName ?? "Unknown",
        customerPhone: o.customerPhone ?? "",
      })),
      Number(total),
      p,
    ),
  );
});

router.put("/:id/status", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const { status } = parse(statusBody, req.body);
  const [current] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!current) throw new HttpError(404, "Order not found");
  if (current.paymentStatus !== "paid" && !["pending", "cancelled"].includes(status)) {
    throw new HttpError(409, "The order must be paid before fulfillment");
  }
  if (status === "cancelled" && current.paymentStatus === "paid") {
    throw new HttpError(409, "Paid orders require a refund workflow before cancellation");
  }
  const [updated] = await db.update(ordersTable).set({ status }).where(eq(ordersTable.id, id)).returning();
  if (!updated) throw new HttpError(404, "Order not found");
  res.json({ ...updated, total: toRupees(updated.total), walletAmount: toRupees(updated.walletAmount) });
});

export default router;
