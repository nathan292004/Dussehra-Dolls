import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db } from "@workspace/db";
import { ordersTable, cartItemsTable, productsTable, chitEnrollmentsTable, chitPlansTable, transactionsTable, walletsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware as any);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Create Razorpay order for cart checkout
router.post("/create-order", async (req: AuthRequest, res) => {
  try {
    const { address } = req.body;
    if (!address?.trim()) return res.status(400).json({ error: "Delivery address is required" });

    const cartItems = await db
      .select({ cartItem: cartItemsTable, product: productsTable })
      .from(cartItemsTable)
      .leftJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
      .where(eq(cartItemsTable.userId, req.userId!));

    if (cartItems.length === 0) return res.status(400).json({ error: "Cart is empty" });

    const orderItems = cartItems.filter(i => i.product).map(i => ({
      productId: i.cartItem.productId,
      productName: i.product!.name,
      quantity: i.cartItem.quantity,
      price: parseFloat(i.product!.price),
      subtotal: parseFloat(i.product!.price) * i.cartItem.quantity,
    }));
    const total = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

    // Create Razorpay order (amount in paise)
    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(total * 100),
      currency: "INR",
      notes: { userId: String(req.userId), address },
    });

    // Create a pending DB order
    const [dbOrder] = await db.insert(ordersTable).values({
      userId: req.userId!,
      items: orderItems,
      total: total.toFixed(2),
      address,
      paymentMethod: "razorpay",
      status: "pending",
      paymentStatus: "pending",
    }).returning();

    return res.json({
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      dbOrderId: dbOrder.id,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Razorpay create order error:", err);
    return res.status(500).json({ error: "Failed to create payment order" });
  }
});

// Verify payment signature and confirm order
router.post("/verify-order", async (req: AuthRequest, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, dbOrderId } = req.body;

    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      await db.update(ordersTable).set({ paymentStatus: "failed" }).where(eq(ordersTable.id, dbOrderId));
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Mark order confirmed
    const [order] = await db.update(ordersTable)
      .set({ status: "confirmed", paymentStatus: "paid" })
      .where(eq(ordersTable.id, dbOrderId))
      .returning();

    // Clear cart
    await db.delete(cartItemsTable).where(eq(cartItemsTable.userId, req.userId!));

    // Log transaction
    await db.insert(transactionsTable).values({
      userId: req.userId!,
      type: "debit",
      amount: order.total,
      description: `Order #${order.id} (Razorpay ${razorpayPaymentId})`,
    });

    return res.json({ success: true, orderId: order.id, order: { ...order, total: parseFloat(order.total) } });
  } catch (err) {
    console.error("Razorpay verify error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

// Create Razorpay order for chit EMI payment
router.post("/create-chit-payment", async (req: AuthRequest, res) => {
  try {
    const { enrollmentId } = req.body;

    const [row] = await db
      .select({ enrollment: chitEnrollmentsTable, plan: chitPlansTable })
      .from(chitEnrollmentsTable)
      .leftJoin(chitPlansTable, eq(chitEnrollmentsTable.chitPlanId, chitPlansTable.id))
      .where(eq(chitEnrollmentsTable.id, enrollmentId))
      .limit(1);

    if (!row || row.enrollment.userId !== req.userId) {
      return res.status(404).json({ error: "Chit enrollment not found" });
    }

    const emi = parseFloat(row.plan!.monthlyContribution);

    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(emi * 100),
      currency: "INR",
      notes: { enrollmentId: String(enrollmentId), userId: String(req.userId) },
    });

    return res.json({
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      emi,
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: row.plan!.name,
    });
  } catch (err) {
    console.error("Razorpay chit order error:", err);
    return res.status(500).json({ error: "Failed to create chit payment order" });
  }
});

// Verify chit EMI payment
router.post("/verify-chit-payment", async (req: AuthRequest, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, enrollmentId } = req.body;

    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const [row] = await db
      .select({ enrollment: chitEnrollmentsTable, plan: chitPlansTable })
      .from(chitEnrollmentsTable)
      .leftJoin(chitPlansTable, eq(chitEnrollmentsTable.chitPlanId, chitPlansTable.id))
      .where(eq(chitEnrollmentsTable.id, enrollmentId))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Enrollment not found" });

    const emi = parseFloat(row.plan!.monthlyContribution);
    const newAmountPaid = parseFloat(row.enrollment.amountPaid) + emi;
    const totalAmount = parseFloat(row.plan!.totalAmount);
    const isCompleted = newAmountPaid >= totalAmount;

    const nextPayment = new Date();
    nextPayment.setMonth(nextPayment.getMonth() + 1);

    await db.update(chitEnrollmentsTable)
      .set({
        amountPaid: newAmountPaid.toFixed(2),
        status: isCompleted ? "completed" : "active",
        nextPaymentDate: isCompleted ? null : nextPayment,
      })
      .where(eq(chitEnrollmentsTable.id, enrollmentId));

    await db.insert(transactionsTable).values({
      userId: req.userId!,
      type: "debit",
      amount: emi.toFixed(2),
      description: `Chit EMI – ${row.plan!.name} (${razorpayPaymentId})`,
    });

    return res.json({ success: true, isCompleted, newAmountPaid });
  } catch (err) {
    console.error("Razorpay chit verify error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

// Create Razorpay order for wallet top-up
router.post("/create-wallet-payment", async (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(parsedAmount * 100),
      currency: "INR",
      notes: { userId: String(req.userId), purpose: "wallet_topup" },
    });

    return res.json({
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Razorpay wallet order error:", err);
    return res.status(500).json({ error: "Failed to create wallet payment order" });
  }
});

// Verify wallet top-up payment and credit balance
router.post("/verify-wallet-payment", async (req: AuthRequest, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Fetch order from Razorpay to get the amount
    const rzpOrder = await razorpay.orders.fetch(razorpayOrderId);
    const amountInRupees = (rzpOrder.amount_paid as number) / 100;

    // Credit wallet — upsert
    const [existing] = await db
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, req.userId!))
      .limit(1);

    if (existing) {
      await db
        .update(walletsTable)
        .set({ balance: sql`${walletsTable.balance} + ${amountInRupees}` })
        .where(eq(walletsTable.userId, req.userId!));
    } else {
      await db.insert(walletsTable).values({
        userId: req.userId!,
        balance: amountInRupees.toFixed(2),
      });
    }

    // Log transaction
    await db.insert(transactionsTable).values({
      userId: req.userId!,
      type: "credit",
      amount: amountInRupees.toFixed(2),
      description: `Wallet top-up via Razorpay (${razorpayPaymentId})`,
    });

    return res.json({ success: true, credited: amountInRupees });
  } catch (err) {
    console.error("Razorpay wallet verify error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

export default router;
