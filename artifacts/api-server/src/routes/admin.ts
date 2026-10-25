import { Router } from "express";
import { and, count, desc, eq, sql, sum } from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable, ordersTable, usersTable, walletsTable, chitPlansTable } from "@workspace/db/schema";
import { toRupees } from "../lib/money";
import adminProductsRouter from "./admin-products";
import adminVendorsRouter from "./admin-vendors";
import adminOrdersRouter from "./admin-orders";
import adminCustomersRouter from "./admin-customers";
import adminChitsRouter from "./admin-chits";
import adminOpsRouter from "./admin-ops";
import whatsappAdminRouter from "./admin-whatsapp";

// Everything under /api/admin. Already gated by requireAdmin (and the audit log) at the mount point in routes/index.ts.
const router = Router();

// ─── Dashboard numbers ───────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  const [totalOrdersRow] = await db.select({ value: count() }).from(ordersTable);
  const [revenueRow] = await db.select({ value: sum(ordersTable.total) }).from(ordersTable).where(eq(ordersTable.paymentStatus, "paid"));
  const [productCountRow] = await db.select({ value: count() }).from(productsTable);
  const [userCountRow] = await db.select({ value: count() }).from(usersTable).where(eq(usersTable.isDeleted, false));
  const [walletCountRow] = await db.select({ value: count() }).from(walletsTable);
  const [lowStockRow] = await db.select({ value: count() }).from(productsTable)
    .where(sql`${productsTable.stock} - ${productsTable.reservedStock} < 5`);
  const [pendingPlansRow] = await db.select({ value: count() }).from(chitPlansTable)
    .where(and(eq(chitPlansTable.isApproved, false), eq(chitPlansTable.isRejected, false), eq(chitPlansTable.status, "active")));

  const recentOrders = await db
    .select({
      id: ordersTable.id,
      userId: ordersTable.userId,
      total: ordersTable.total,
      status: ordersTable.status,
      paymentStatus: ordersTable.paymentStatus,
      paymentMethod: ordersTable.paymentMethod,
      address: ordersTable.address,
      addressLink: ordersTable.addressLink,
      items: ordersTable.items,
      createdAt: ordersTable.createdAt,
      customerName: sql<string>`concat_ws(' ', ${usersTable.fname}, ${usersTable.lname})`,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.userId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);

  res.json({
    totalOrders: Number(totalOrdersRow.value ?? 0),
    totalRevenue: toRupees(revenueRow.value ?? "0"),
    activeProducts: Number(productCountRow.value ?? 0),
    lowStockCount: Number(lowStockRow.value ?? 0),
    totalUsers: Number(userCountRow.value ?? 0),
    totalWallets: Number(walletCountRow.value ?? 0),
    pendingChitApprovals: Number(pendingPlansRow.value ?? 0),
    recentOrders: recentOrders.map((o) => ({
      ...o,
      total: toRupees(o.total),
      customerName: o.customerName ?? "Unknown",
    })),
  });
});

router.use("/products", adminProductsRouter);
router.use("/vendors", adminVendorsRouter);
router.use("/orders", adminOrdersRouter);
router.use(adminCustomersRouter); // /users and /wallets
router.use("/chit-plans", adminChitsRouter);
router.use("/ops", adminOpsRouter);
router.use("/whatsapp", whatsappAdminRouter);

export default router;
