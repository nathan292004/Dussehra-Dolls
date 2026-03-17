import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, ordersTable, usersTable } from "@workspace/db/schema";
import { eq, lt, count, sum, desc } from "drizzle-orm";

const router = Router();

const formatProduct = (p: typeof productsTable.$inferSelect) => ({
  ...p,
  price: parseFloat(p.price),
  originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : null,
  rating: p.rating ? parseFloat(p.rating) : 0,
});

const formatOrder = (o: typeof ordersTable.$inferSelect & { customerName?: string | null }) => ({
  ...o,
  total: parseFloat(o.total),
  customerName: o.customerName ?? "Unknown",
});

router.get("/stats", async (_req, res) => {
  try {
    const [totalOrdersRow] = await db.select({ value: count() }).from(ordersTable);
    const [revenueRow] = await db.select({ value: sum(ordersTable.total) }).from(ordersTable);
    const [productCountRow] = await db.select({ value: count() }).from(productsTable);
    const lowStockRows = await db.select({ value: count() }).from(productsTable).where(lt(productsTable.stock, 5));

    const recentOrders = await db
      .select({
        id: ordersTable.id,
        userId: ordersTable.userId,
        total: ordersTable.total,
        status: ordersTable.status,
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
    const {
      name, description, price, originalPrice, category,
      imageUrl, stock, isFeatured, tags,
    } = req.body;

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
    const {
      name, description, price, originalPrice, category,
      imageUrl, stock, isFeatured, tags, rating, reviewCount,
    } = req.body;

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
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []);
    }

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

router.get("/orders", async (_req, res) => {
  try {
    const orders = await db
      .select({
        id: ordersTable.id,
        userId: ordersTable.userId,
        total: ordersTable.total,
        status: ordersTable.status,
        paymentMethod: ordersTable.paymentMethod,
        address: ordersTable.address,
        items: ordersTable.items,
        createdAt: ordersTable.createdAt,
        customerName: usersTable.name,
        customerEmail: usersTable.email,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
      .orderBy(desc(ordersTable.createdAt));

    return res.json(orders.map(o => ({
      ...o,
      total: parseFloat(o.total),
      customerName: o.customerName ?? "Unknown",
      customerEmail: o.customerEmail ?? "",
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    const validStatuses = ["confirmed", "processing", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const [updated] = await db
      .update(ordersTable)
      .set({ status })
      .where(eq(ordersTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Order not found" });

    return res.json({ ...updated, total: parseFloat(updated.total) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
