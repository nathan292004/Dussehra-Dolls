import { Router } from "express";
import { db } from "@workspace/db";
import {
  productsTable, ordersTable, usersTable, walletsTable,
  chitPlansTable, vendorsTable,
} from "@workspace/db/schema";
import { and, eq, count, sum, desc, sql, lte } from "drizzle-orm";
import { paiseToDecimal, parsePaise, toRupees } from "../lib/money";
import adminChitsRouter from "./admin-chits";
import adminOpsRouter from "./admin-ops";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import whatsappAdminRouter from "./admin-whatsapp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only .jpg, .jpeg, .png, and .webp files are allowed"));
    }
  },
});

const router = Router();

// Already gated by requireAdmin at the mount point in routes/index.ts.
router.use("/whatsapp", whatsappAdminRouter);

// ─── Image Upload ─────────────────────────────────────────────────────────────
router.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image file uploaded" });
    return;
  }
  const domain =
    process.env["REPLIT_DEV_DOMAIN"] ||
    req.get("x-forwarded-host") ||
    req.get("host") ||
    "localhost:8080";
  const protocol = process.env.REPLIT_DEV_DOMAIN ? "https" : req.protocol;
  const origin = process.env.API_PUBLIC_ORIGIN || `${protocol}://${domain}`;
  const url = `${origin.replace(/\/$/, "")}/api/uploads/${req.file.filename}`;
  res.json({ url });
});

// Admin sees the real numbers: stock on the shelf, units held by unpaid checkouts, and what can still be sold.
const formatProduct = (p: typeof productsTable.$inferSelect) => ({
  ...p,
  availableStock: Math.max(p.stock - p.reservedStock, 0),
  price: toRupees(p.price),
  originalPrice: p.originalPrice ? toRupees(p.originalPrice) : null,
  rating: p.rating ? parseFloat(p.rating) : 0,
});

const formatOrder = (o: typeof ordersTable.$inferSelect & { customerName?: string | null; customerPhone?: string | null }) => ({
  ...o,
  total: toRupees(o.total),
  walletAmount: toRupees(o.walletAmount),
  customerName: o.customerName ?? "Unknown",
  customerPhone: o.customerPhone ?? "",
});

// ─── Stats ───────────────────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const [totalOrdersRow] = await db.select({ value: count() }).from(ordersTable);
    const [revenueRow] = await db.select({ value: sum(ordersTable.total) }).from(ordersTable).where(eq(ordersTable.paymentStatus, "paid"));
    const [productCountRow] = await db.select({ value: count() }).from(productsTable);
    const [userCountRow] = await db.select({ value: count() }).from(usersTable).where(eq(usersTable.isDeleted, false));
    const [walletCountRow] = await db.select({ value: count() }).from(walletsTable);
    const lowStockRows = await db.select({ value: count() }).from(productsTable)
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
        addressLatitude: ordersTable.addressLatitude,
        addressLongitude: ordersTable.addressLongitude,
        items: ordersTable.items,
        createdAt: ordersTable.createdAt,
        customerName: sql<string>`concat_ws(' ', ${usersTable.fname}, ${usersTable.lname})`,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.userId, usersTable.userId))
      .orderBy(desc(ordersTable.createdAt))
      .limit(10);

    return res.json({
      totalOrders: Number(totalOrdersRow.value ?? 0),
      totalRevenue: toRupees(revenueRow.value ?? "0"),
      activeProducts: Number(productCountRow.value ?? 0),
      lowStockCount: Number(lowStockRows[0]?.value ?? 0),
      totalUsers: Number(userCountRow.value ?? 0),
      totalWallets: Number(walletCountRow.value ?? 0),
      pendingChitApprovals: Number(pendingPlansRow.value ?? 0),
      recentOrders: recentOrders.map(o => ({
        ...o,
        total: toRupees(o.total),
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
    if (!name || price === undefined || price === null || price === "" || !category) {
      return res.status(400).json({ error: "name, price, and category are required" });
    }
    const pricePaise = parsePaise(price);
    if (pricePaise === null || pricePaise < 0) {
      return res.status(400).json({ error: "Price must be a valid amount with at most 2 decimals" });
    }
    const originalPaise = originalPrice ? parsePaise(originalPrice) : null;
    if (originalPrice && (originalPaise === null || originalPaise < 0)) {
      return res.status(400).json({ error: "Original price must be a valid amount with at most 2 decimals" });
    }
    const stockValue = stock === undefined || stock === "" ? 0 : Number(stock);
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      return res.status(400).json({ error: "Stock must be a whole number, 0 or more" });
    }
    const [product] = await db.insert(productsTable).values({
      name,
      description: description ?? null,
      price: paiseToDecimal(pricePaise),
      originalPrice: originalPaise !== null ? paiseToDecimal(originalPaise) : null,
      category,
      imageUrl: imageUrl ?? null,
      stock: stockValue,
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
    if (price !== undefined) {
      const pricePaise = parsePaise(price);
      if (pricePaise === null || pricePaise < 0) {
        return res.status(400).json({ error: "Price must be a valid amount with at most 2 decimals" });
      }
      updateData.price = paiseToDecimal(pricePaise);
    }
    if (originalPrice !== undefined) {
      const originalPaise = originalPrice ? parsePaise(originalPrice) : null;
      if (originalPrice && (originalPaise === null || originalPaise < 0)) {
        return res.status(400).json({ error: "Original price must be a valid amount with at most 2 decimals" });
      }
      updateData.originalPrice = originalPaise !== null ? paiseToDecimal(originalPaise) : null;
    }
    if (category !== undefined) updateData.category = category;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    let newStock: number | null = null;
    if (stock !== undefined) {
      newStock = Number(stock);
      if (!Number.isInteger(newStock) || newStock < 0) {
        return res.status(400).json({ error: "Stock must be a whole number, 0 or more" });
      }
      updateData.stock = newStock;
    }
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;
    if (rating !== undefined) updateData.rating = parseFloat(rating).toFixed(2);
    if (reviewCount !== undefined) updateData.reviewCount = parseInt(reviewCount);
    if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
    if (location !== undefined) updateData.location = location;
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []);
    }
    updateData.updatedAt = new Date();
    // Stock may not be set below the units customers are currently holding in unpaid checkouts.
    const guard = newStock !== null
      ? and(eq(productsTable.id, id), lte(productsTable.reservedStock, newStock))
      : eq(productsTable.id, id);
    const [updated] = await db.update(productsTable).set(updateData).where(guard).returning();
    if (!updated) {
      const [exists] = await db.select({ reserved: productsTable.reservedStock }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
      if (!exists) return res.status(404).json({ error: "Product not found" });
      return res.status(409).json({
        error: `${exists.reserved} unit(s) are held by customers who are paying right now, so stock cannot be set below ${exists.reserved}. Try again in a few minutes.`,
        code: "STOCK_HELD",
      });
    }
    return res.json(formatProduct(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.reservedStock, 0))).returning();
    if (!deleted) {
      const [exists] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
      if (!exists) return res.status(404).json({ error: "Product not found" });
      return res.status(409).json({ error: "Customers are paying for this product right now. Try again in a few minutes.", code: "STOCK_HELD" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/products/:id/toggle-listing", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [current] = await db.select({ isListed: productsTable.isListed }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!current) return res.status(404).json({ error: "Product not found" });
    const [updated] = await db
      .update(productsTable)
      .set({ isListed: !current.isListed, updatedAt: new Date() })
      .where(eq(productsTable.id, id))
      .returning();
    return res.json(formatProduct(updated));
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
        walletAmount: ordersTable.walletAmount,
        status: ordersTable.status,
        paymentStatus: ordersTable.paymentStatus,
        paymentMethod: ordersTable.paymentMethod,
        address: ordersTable.address,
        addressLatitude: ordersTable.addressLatitude,
        addressLongitude: ordersTable.addressLongitude,
        items: ordersTable.items,
        createdAt: ordersTable.createdAt,
        customerName: sql<string>`concat_ws(' ', ${usersTable.fname}, ${usersTable.lname})`,
        customerPhone: usersTable.phone,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.userId, usersTable.userId))
      .orderBy(desc(ordersTable.createdAt));

    return res.json(orders.map(o => ({
      ...o,
      total: toRupees(o.total),
      walletAmount: toRupees(o.walletAmount),
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
    if (paymentStatus !== undefined) return res.status(400).json({ error: "Payment status is controlled by verified payments" });
    const [current] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!current) return res.status(404).json({ error: "Order not found" });
    if (status && current.paymentStatus !== "paid" && !["pending", "cancelled"].includes(status))
      return res.status(409).json({ error: "The order must be paid before fulfillment" });
    if (status === "cancelled" && current.paymentStatus === "paid")
      return res.status(409).json({ error: "Paid orders require a refund workflow before cancellation" });

    const updateData: Partial<typeof ordersTable.$inferInsert> = {};
    if (status !== undefined) {
      if (!validStatuses.includes(status)) return res.status(400).json({ error: `Invalid status` });
      updateData.status = status;
    }

    const [updated] = await db.update(ordersTable).set(updateData).where(eq(ordersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Order not found" });
    return res.json({ ...updated, total: toRupees(updated.total), walletAmount: toRupees(updated.walletAmount) });
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
        userId: usersTable.userId,
        index: usersTable.index,
        fname: usersTable.fname,
        lname: usersTable.lname,
        name: sql<string>`concat_ws(' ', ${usersTable.fname}, ${usersTable.lname})`,
        phone: usersTable.phone,
        address: usersTable.address,
        isReseller: usersTable.isReseller,
        resellerCode: usersTable.resellerCode,
        isActive: usersTable.isActive,
        isDeleted: usersTable.isDeleted,
        deletedAt: usersTable.deletedAt,
        deletionReason: usersTable.deletionReason,
        registeredAt: usersTable.registeredAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.index));
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
        chitLockedBalance: walletsTable.chitLockedBalance,
        updatedAt: walletsTable.updatedAt,
        userName: sql<string>`concat_ws(' ', ${usersTable.fname}, ${usersTable.lname})`,
        userPhone: usersTable.phone,
      })
      .from(walletsTable)
      .leftJoin(usersTable, eq(walletsTable.userId, usersTable.userId))
      .orderBy(desc(walletsTable.updatedAt));
    return res.json(wallets.map(w => ({ ...w, balance: toRupees(w.balance), chitLockedBalance: toRupees(w.chitLockedBalance) })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Chit plan approvals, subscriptions, and the operations dashboard ─────────
router.use("/chit-plans", adminChitsRouter);
router.use("/ops", adminOpsRouter);

export default router;
