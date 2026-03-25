import { Router } from "express";
import { db } from "@workspace/db";
import {
  productsTable, ordersTable, usersTable, walletsTable,
  chitPlansTable, chitEnrollmentsTable, vendorsTable,
} from "@workspace/db/schema";
import { eq, lt, count, sum, desc, sql } from "drizzle-orm";
import {
  notifyOrderConfirmed,
  notifyChitEmiPaid,
  notifyWalletTopUp,
  notifyChitDueReminder,
} from "../lib/whatsapp-notifications";

const router = Router();

const formatProduct = (p: typeof productsTable.$inferSelect) => ({
  ...p,
  price: parseFloat(p.price),
  originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : null,
  rating: p.rating ? parseFloat(p.rating) : 0,
});

const formatOrder = (o: typeof ordersTable.$inferSelect & { customerName?: string | null; customerPhone?: string | null }) => ({
  ...o,
  total: parseFloat(o.total),
  customerName: o.customerName ?? "Unknown",
  customerPhone: o.customerPhone ?? "",
});

// ─── Stats ───────────────────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const [totalOrdersRow] = await db.select({ value: count() }).from(ordersTable);
    const [revenueRow] = await db.select({ value: sum(ordersTable.total) }).from(ordersTable);
    const [productCountRow] = await db.select({ value: count() }).from(productsTable);
    const [userCountRow] = await db.select({ value: count() }).from(usersTable);
    const [walletCountRow] = await db.select({ value: count() }).from(walletsTable);
    const lowStockRows = await db.select({ value: count() }).from(productsTable).where(lt(productsTable.stock, 5));

    const recentOrders = await db
      .select({
        id: ordersTable.id,
        userId: ordersTable.userId,
        total: ordersTable.total,
        status: ordersTable.status,
        paymentStatus: ordersTable.paymentStatus,
        paymentMethod: ordersTable.paymentMethod,
        address: ordersTable.address,
        items: ordersTable.items,
        createdAt: ordersTable.createdAt,
        customerName: usersTable.name,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
      .orderBy(desc(ordersTable.createdAt))
      .limit(10);

    return res.json({
      totalOrders: Number(totalOrdersRow.value ?? 0),
      totalRevenue: parseFloat(revenueRow.value ?? "0"),
      activeProducts: Number(productCountRow.value ?? 0),
      lowStockCount: Number(lowStockRows[0]?.value ?? 0),
      totalUsers: Number(userCountRow.value ?? 0),
      totalWallets: Number(walletCountRow.value ?? 0),
      recentOrders: recentOrders.map(o => ({
        ...o,
        total: parseFloat(o.total),
        customerName: o.customerName ?? "Unknown",
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Products ─────────────────────────────────────────────────────────────────
router.get("/products", async (_req, res) => {
  try {
    const products = await db.select().from(productsTable).orderBy(desc(productsTable.createdAt));
    return res.json(products.map(formatProduct));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/products", async (req, res) => {
  try {
    const { name, description, price, originalPrice, category, imageUrl, stock, isFeatured, tags, serialNumber, location } = req.body;
    if (!name || !price || !category) {
      return res.status(400).json({ error: "name, price, and category are required" });
    }
    const [product] = await db.insert(productsTable).values({
      name,
      description: description ?? null,
      price: parseFloat(price).toFixed(2),
      originalPrice: originalPrice ? parseFloat(originalPrice).toFixed(2) : null,
      category,
      imageUrl: imageUrl ?? null,
      stock: parseInt(stock ?? "0"),
      isFeatured: isFeatured ?? false,
      tags: Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []),
      serialNumber: serialNumber ?? null,
      location: location ?? null,
    }).returning();
    return res.status(201).json(formatProduct(product));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, price, originalPrice, category, imageUrl, stock, isFeatured, tags, rating, reviewCount, serialNumber, location } = req.body;
    const updateData: Partial<typeof productsTable.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = parseFloat(price).toFixed(2);
    if (originalPrice !== undefined) updateData.originalPrice = originalPrice ? parseFloat(originalPrice).toFixed(2) : null;
    if (category !== undefined) updateData.category = category;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (stock !== undefined) updateData.stock = parseInt(stock);
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;
    if (rating !== undefined) updateData.rating = parseFloat(rating).toFixed(2);
    if (reviewCount !== undefined) updateData.reviewCount = parseInt(reviewCount);
    if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
    if (location !== undefined) updateData.location = location;
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []);
    }
    updateData.updatedAt = new Date();
    const [updated] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Product not found" });
    return res.json(formatProduct(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(productsTable).where(eq(productsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Product not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Vendors ─────────────────────────────────────────────────────────────────
router.get("/vendors", async (_req, res) => {
  try {
    const vendors = await db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt));
    return res.json(vendors);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/vendors", async (req, res) => {
  try {
    const { name, contact, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const [vendor] = await db.insert(vendorsTable).values({ name, contact, email, phone }).returning();
    return res.status(201).json(vendor);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/vendors/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, contact, email, phone } = req.body;
    const updateData: Partial<typeof vendorsTable.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (contact !== undefined) updateData.contact = contact;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    const [updated] = await db.update(vendorsTable).set(updateData).where(eq(vendorsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/vendors/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(vendorsTable).where(eq(vendorsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Vendor not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Orders ─────────────────────────────────────────────────────────────────
router.get("/orders", async (_req, res) => {
  try {
    const orders = await db
      .select({
        id: ordersTable.id,
        userId: ordersTable.userId,
        total: ordersTable.total,
        status: ordersTable.status,
        paymentStatus: ordersTable.paymentStatus,
        paymentMethod: ordersTable.paymentMethod,
        address: ordersTable.address,
        items: ordersTable.items,
        createdAt: ordersTable.createdAt,
        customerName: usersTable.name,
        customerPhone: usersTable.phone,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
      .orderBy(desc(ordersTable.createdAt));

    return res.json(orders.map(o => ({
      ...o,
      total: parseFloat(o.total),
      customerName: o.customerName ?? "Unknown",
      customerPhone: o.customerPhone ?? "",
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, paymentStatus } = req.body;
    const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
    const validPaymentStatuses = ["pending", "paid", "failed"];

    const updateData: Partial<typeof ordersTable.$inferInsert> = {};
    if (status !== undefined) {
      if (!validStatuses.includes(status)) return res.status(400).json({ error: `Invalid status` });
      updateData.status = status;
    }
    if (paymentStatus !== undefined) {
      if (!validPaymentStatuses.includes(paymentStatus)) return res.status(400).json({ error: `Invalid paymentStatus` });
      updateData.paymentStatus = paymentStatus;
    }

    const [updated] = await db.update(ordersTable).set(updateData).where(eq(ordersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Order not found" });
    return res.json({ ...updated, total: parseFloat(updated.total) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────
router.get("/users", async (_req, res) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt));
    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Wallets ─────────────────────────────────────────────────────────────────
router.get("/wallets", async (_req, res) => {
  try {
    const wallets = await db
      .select({
        id: walletsTable.id,
        userId: walletsTable.userId,
        balance: walletsTable.balance,
        updatedAt: walletsTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userPhone: usersTable.phone,
      })
      .from(walletsTable)
      .leftJoin(usersTable, eq(walletsTable.userId, usersTable.id))
      .orderBy(desc(walletsTable.updatedAt));
    return res.json(wallets.map(w => ({ ...w, balance: parseFloat(w.balance) })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Chit Plans ──────────────────────────────────────────────────────────────
router.get("/chit-plans", async (_req, res) => {
  try {
    const plans = await db.select().from(chitPlansTable).orderBy(desc(chitPlansTable.createdAt));
    return res.json(plans.map(p => ({
      ...p,
      totalAmount: parseFloat(p.totalAmount),
      monthlyContribution: parseFloat(p.monthlyContribution),
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Chit Subscriptions ──────────────────────────────────────────────────────
router.get("/chit-subscriptions", async (_req, res) => {
  try {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const enrollments = await db
      .select({
        enrollment: chitEnrollmentsTable,
        plan: chitPlansTable,
        user: {
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          phone: usersTable.phone,
        },
      })
      .from(chitEnrollmentsTable)
      .leftJoin(chitPlansTable, eq(chitEnrollmentsTable.chitPlanId, chitPlansTable.id))
      .leftJoin(usersTable, eq(chitEnrollmentsTable.userId, usersTable.id))
      .orderBy(desc(chitEnrollmentsTable.joinedAt));

    const allEnrollments = enrollments.filter(e => e.plan).map(e => {
      const amountPaid = parseFloat(e.enrollment.amountPaid);
      const totalAmount = parseFloat(e.plan!.totalAmount);
      const monthlyEmi = parseFloat(e.plan!.monthlyContribution);
      const duration = e.plan!.duration ?? 0;
      const progress = totalAmount > 0 ? Math.min(100, Math.round((amountPaid / totalAmount) * 100)) : 0;
      const monthsCompleted = monthlyEmi > 0 ? Math.min(duration, Math.round(amountPaid / monthlyEmi)) : 0;
      const isCompleted = e.enrollment.status === "completed" || amountPaid >= totalAmount;

      const nextPayment = e.enrollment.nextPaymentDate;

      // Determine accurate payment status:
      // - paid:    nextPaymentDate is next month or later (EMI paid this month), or plan completed
      // - overdue: nextPaymentDate is before this month (missed a past payment), plan still active
      // - pending: nextPaymentDate is within this month (EMI not yet paid, still on time)
      let paymentStatus: "paid" | "pending" | "overdue" = "pending";
      let isOverdue = false;
      let daysOverdue = 0;

      if (isCompleted) {
        paymentStatus = "paid";
      } else if (!nextPayment || amountPaid === 0) {
        // No payments made yet — always pending, even if nextPaymentDate is in the future
        paymentStatus = "pending";
      } else {
        const nextDate = new Date(nextPayment);
        if (nextDate >= nextMonthStart) {
          // nextPaymentDate moved past this month → paid their EMI this month
          paymentStatus = "paid";
        } else if (nextDate < thisMonthStart) {
          // nextPaymentDate is before this month → missed a payment, overdue
          paymentStatus = "overdue";
          isOverdue = true;
          daysOverdue = Math.floor((now.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24));
        } else {
          // nextPaymentDate is this month → EMI due but not yet paid
          paymentStatus = "pending";
        }
      }

      const paidThisMonth = paymentStatus === "paid" && !isCompleted ? monthlyEmi : 0;

      return {
        id: e.enrollment.id,
        planId: e.plan!.id,
        planName: e.plan!.name,
        totalAmount,
        monthlyEmi,
        duration,
        monthsCompleted,
        amountPaid,
        progress,
        status: isCompleted ? "completed" : e.enrollment.status,
        isCompleted,
        isOverdue,
        daysOverdue,
        joinedAt: e.enrollment.joinedAt,
        nextPaymentDate: e.enrollment.nextPaymentDate,
        user: e.user,
        paidThisMonth,
        paymentStatus,
      };
    });

    const totalSubscriptions = allEnrollments.length;
    const thisMonthPaid = allEnrollments.filter(e => e.paymentStatus === "paid" && !e.isCompleted).length;
    const thisMonthPending = allEnrollments.filter(e => e.paymentStatus === "pending").length;
    const overdueCount = allEnrollments.filter(e => e.isOverdue).length;
    const completedPlans = allEnrollments.filter(e => e.isCompleted).length;

    return res.json({
      stats: { totalSubscriptions, thisMonthPaid, thisMonthPending, overdueCount, completedPlans },
      enrollments: allEnrollments,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── WhatsApp test endpoint ───────────────────────────────────────────────────
// POST /api/admin/test-whatsapp?type=order|chit|wallet|reminder
// Sends a sample WhatsApp notification to WHATSAPP_TEST_NUMBER
router.post("/test-whatsapp", async (req, res) => {
  const testNumber = process.env.WHATSAPP_TEST_NUMBER;
  if (!testNumber) {
    return res.status(400).json({ error: "WHATSAPP_TEST_NUMBER env var not set" });
  }

  const type = (req.query.type as string) || "order";

  try {
    let result: any;

    if (type === "order") {
      result = await notifyOrderConfirmed({
        phone: testNumber,
        name: "Test Customer",
        orderId: 1001,
        total: 2499,
        items: [
          { productName: "Navratri Special Doll Set", quantity: 2, price: 999 },
          { productName: "Dussehra Festive Doll", quantity: 1, price: 501 },
        ],
      });
    } else if (type === "chit") {
      result = await notifyChitEmiPaid({
        phone: testNumber,
        name: "Test Customer",
        planName: "Gold Savings – ₹2,000/mo",
        emiAmount: 2000,
        totalPaid: 6000,
        totalAmount: 24000,
        isCompleted: false,
        nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    } else if (type === "wallet") {
      result = await notifyWalletTopUp({
        phone: testNumber,
        name: "Test Customer",
        credited: 1000,
        newBalance: 3500,
      });
    } else if (type === "reminder") {
      result = await notifyChitDueReminder({
        phone: testNumber,
        name: "Test Customer",
        planName: "Gold Savings – ₹2,000/mo",
        emiAmount: 2000,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        daysLeft: 1,
      });
    } else {
      return res.status(400).json({ error: "type must be: order | chit | wallet | reminder" });
    }

    return res.json({ success: true, type, to: testNumber, sid: (result as any)?.sid });
  } catch (err: any) {
    console.error("[WhatsApp test] Error:", err);
    return res.status(500).json({ error: err.message || "Failed to send test message" });
  }
});

export default router;
