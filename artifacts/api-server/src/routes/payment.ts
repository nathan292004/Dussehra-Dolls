import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  ordersTable,
  cartItemsTable,
  productsTable,
  chitPaymentIntentsTable,
  transactionsTable,
  walletsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { createChitPayment, settleChitPayment, PaymentFlowError } from "../services/chit-payments";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import {
  notifyOrderConfirmed,
  notifyWalletTopUp,
} from "../lib/whatsapp-notifications";

const router = Router();
router.use(authMiddleware as any);

export const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      })
    : null;

router.use((req, res, next) => {
  if (req.path === "/checkout-with-wallet") return next();
  if (!razorpay) {
    res
      .status(503)
      .json({
        error:
          "Payments are unavailable. Configure Razorpay credentials in the API environment.",
      });
    return;
  }
  next();
});

function validSignature(
  orderId: unknown,
  paymentId: unknown,
  signature: unknown,
): boolean {
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

// Create Razorpay order for cart checkout
router.post("/create-order", async (req: AuthRequest, res) => {
  try {
    const { address, latitude, longitude } = req.body;
    if (typeof address !== "string" || address.trim().length < 10 || address.length > 500)
      return res.status(400).json({ error: "Delivery address is required" });
    if ((latitude !== undefined || longitude !== undefined) &&
      (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180))
      return res.status(400).json({ error: "Selected map location is invalid" });

    const cartItems = await db
      .select({ cartItem: cartItemsTable, product: productsTable })
      .from(cartItemsTable)
      .leftJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
      .where(eq(cartItemsTable.userId, req.userId!));

    if (cartItems.length === 0)
      return res.status(400).json({ error: "Cart is empty" });
    if (
      cartItems.some(
        (item) =>
          !item.product ||
          !Number.isInteger(item.cartItem.quantity) ||
          item.cartItem.quantity < 1 ||
          item.product.stock < item.cartItem.quantity,
      )
    ) {
      return res
        .status(409)
        .json({
          error: "Some cart items are unavailable or exceed current stock.",
        });
    }

    const orderItems = cartItems
      .filter((i) => i.product)
      .map((i) => ({
        productId: i.cartItem.productId,
        productName: i.product!.name,
        quantity: i.cartItem.quantity,
        price: parseFloat(i.product!.price),
        subtotal: parseFloat(i.product!.price) * i.cartItem.quantity,
      }));
    const total = orderItems.reduce((sum, i) => sum + i.subtotal, 0);

    // Create Razorpay order (amount in paise)
    const rzpOrder = await razorpay!.orders.create({
      amount: Math.round(total * 100),
      currency: "INR",
      notes: { userId: String(req.userId), address, ...(latitude !== undefined ? { latitude: String(latitude), longitude: String(longitude) } : {}) },
    });

    // Create a pending DB order
    const [dbOrder] = await db
      .insert(ordersTable)
      .values({
        userId: req.userId!,
        items: orderItems,
        total: total.toFixed(2),
        address,
        addressLatitude: latitude ?? null,
        addressLongitude: longitude ?? null,
        paymentMethod: "razorpay",
        status: "pending",
        paymentStatus: "pending",
        razorpayOrderId: rzpOrder.id,
      })
      .returning();

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
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, dbOrderId } =
      req.body;

    if (
      !validSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)
    ) {
      return res.status(400).json({ error: "Payment verification failed" });
    }
    const [invoice] = await db
      .select()
      .from(ordersTable)
      .where(
        and(eq(ordersTable.id, dbOrderId), eq(ordersTable.userId, req.userId!)),
      )
      .limit(1);
    if (!invoice) return res.status(404).json({ error: "Order not found" });
    if (invoice.razorpayOrderId !== razorpayOrderId)
      return res
        .status(400)
        .json({ error: "Payment order does not match this purchase." });
    const [providerOrder, providerPayment] = await Promise.all([
      razorpay!.orders.fetch(razorpayOrderId), razorpay!.payments.fetch(razorpayPaymentId),
    ]);
    if (
      providerPayment.status !== "captured" ||
      providerPayment.order_id !== razorpayOrderId ||
      Number(providerPayment.amount) !== Math.round(parseFloat(invoice.total) * 100) ||
      String(providerOrder.notes?.userId) !== String(req.userId) ||
      providerOrder.status !== "paid" ||
      Number(providerOrder.amount_paid) !==
        Math.round(parseFloat(invoice.total) * 100)
    ) {
      return res
        .status(400)
        .json({
          error:
            "The purchase payment has not been captured for the expected amount.",
        });
    }
    const { order, applied } = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${razorpayPaymentId}))`,
      );
      const [current] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, dbOrderId))
        .for("update");
      if (current.paymentStatus === "paid")
        return { order: current, applied: false };
      for (const item of current.items) {
        if (!Number.isInteger(item.quantity) || item.quantity < 1)
          throw new Error("Invalid order quantity");
        const changed = await tx
          .update(productsTable)
          .set({
            stock: sql`${productsTable.stock} - ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(productsTable.id, item.productId),
              gte(productsTable.stock, item.quantity),
            ),
          )
          .returning({ id: productsTable.id });
        if (!changed.length)
          throw new Error("Insufficient inventory to fulfill this paid order");
      }
      const [confirmed] = await tx
        .update(ordersTable)
        .set({ status: "confirmed", paymentStatus: "paid" })
        .where(eq(ordersTable.id, dbOrderId))
        .returning();
      await tx
        .delete(cartItemsTable)
        .where(eq(cartItemsTable.userId, req.userId!));
      await tx
        .insert(transactionsTable)
        .values({
          userId: req.userId!,
          type: "debit",
          amount: confirmed.total,
          razorpayPaymentId,
          description: `Order #${confirmed.id} (Razorpay ${razorpayPaymentId})`,
        });
      return { order: confirmed, applied: true };
    });

    if (applied) {
      notifyOrderConfirmed({ userId: req.userId!, orderId: order.id, total: Number(order.total) })
        .catch((e) => console.error("[WhatsApp] Queue order failed:", e));
    }

    return res.json({
      success: true,
      orderId: order.id,
      order: { ...order, total: parseFloat(order.total) },
    });
  } catch (err) {
    console.error("Razorpay verify error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

// Spend verified store balance on dolls.
router.post("/checkout-with-wallet", async (req: AuthRequest, res) => {
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  const { latitude, longitude } = req.body || {};
  if (address.length < 10 || address.length > 500) return res.status(400).json({ error: "Enter a complete delivery address" });
  if ((latitude !== undefined || longitude !== undefined) &&
    (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({ error: "Selected map location is invalid" });
  }
  try {
    const result = await db.transaction(async tx => {
      const [wallet] = await tx.select().from(walletsTable)
        .where(eq(walletsTable.userId, req.userId!)).for("update").limit(1);
      if (!wallet) throw new PaymentFlowError(409, "No store balance is available");
      const cart = await tx.select({ cartItem: cartItemsTable, product: productsTable })
        .from(cartItemsTable).leftJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
        .where(eq(cartItemsTable.userId, req.userId!));
      if (!cart.length || cart.some(row => !row.product || !Number.isInteger(row.cartItem.quantity) || row.cartItem.quantity < 1)) {
        throw new PaymentFlowError(409, "Cart is empty or invalid");
      }
      const items = cart.map(row => ({
        productId: row.cartItem.productId, productName: row.product!.name,
        quantity: row.cartItem.quantity, price: Number(row.product!.price),
        subtotal: Number(row.product!.price) * row.cartItem.quantity,
      }));
      const totalPaise = items.reduce((sum, item) => sum + Math.round(item.subtotal * 100), 0);
      if (totalPaise <= 0 || Math.round(Number(wallet.balance) * 100) < totalPaise) {
        throw new PaymentFlowError(409, "Insufficient store balance");
      }
      for (const item of items) {
        const changed = await tx.update(productsTable).set({
          stock: sql`${productsTable.stock} - ${item.quantity}`, updatedAt: new Date(),
        }).where(and(eq(productsTable.id, item.productId), gte(productsTable.stock, item.quantity)))
          .returning({ id: productsTable.id });
        if (!changed.length) throw new PaymentFlowError(409, "A product is out of stock");
      }
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${totalPaise / 100}`, updatedAt: new Date(),
      }).where(eq(walletsTable.id, wallet.id));
      const [order] = await tx.insert(ordersTable).values({
        userId: req.userId!, items, total: (totalPaise / 100).toFixed(2), address,
        addressLatitude: latitude ?? null, addressLongitude: longitude ?? null,
        paymentMethod: "store_balance", status: "confirmed", paymentStatus: "paid",
      }).returning();
      await tx.insert(transactionsTable).values({
        userId: req.userId!, type: "debit", amount: (totalPaise / 100).toFixed(2),
        description: `Doll order #${order.id} paid with store balance`,
      });
      await tx.delete(cartItemsTable).where(eq(cartItemsTable.userId, req.userId!));
      return { success: true, orderId: order.id, total: totalPaise / 100 };
    });
    notifyOrderConfirmed({ userId: req.userId!, orderId: result.orderId, total: result.total })
      .catch((e) => console.error("[WhatsApp] Queue order failed:", e));
    return res.json(result);
  } catch (err) {
    if (err instanceof PaymentFlowError) return res.status(err.statusCode).json({ error: err.message });
    console.error("Store balance checkout failed:", err);
    return res.status(500).json({ error: "Could not complete checkout" });
  }
});

// Doll plan installments use one durable server-side payment intent.
router.post("/create-chit-payment", async (req: AuthRequest, res) => {
  try {
    const result = await createChitPayment(razorpay!, req.userId!, Number(req.body?.enrollmentId));
    return res.json({ ...result, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    if (err instanceof PaymentFlowError) return res.status(err.statusCode).json({ error: err.message });
    console.error("Create installment payment failed:", err);
    return res.status(500).json({ error: "Failed to create installment payment" });
  }
});

router.post("/verify-chit-payment", async (req: AuthRequest, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, enrollmentId } = req.body;
    if (!validSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return res.status(400).json({ error: "Payment verification failed" });
    }
    // The intent itself binds the payment to the enrollment. Never trust the client amount.
    const [intent] = await db.select({ enrollmentId: chitPaymentIntentsTable.enrollmentId })
      .from(chitPaymentIntentsTable).where(eq(chitPaymentIntentsTable.razorpayOrderId, razorpayOrderId)).limit(1);
    if (!intent || intent.enrollmentId !== Number(enrollmentId)) {
      return res.status(400).json({ error: "Payment enrollment mismatch" });
    }
    const result = await settleChitPayment(razorpay!, razorpayOrderId, razorpayPaymentId, req.userId!);
    return res.json(result);
  } catch (err) {
    if (err instanceof PaymentFlowError) return res.status(err.statusCode).json({ error: err.message });
    console.error("Verify installment payment failed:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

// Create Razorpay order for wallet top-up
router.post("/create-wallet-payment", async (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1 || parsedAmount > 100000 || Math.abs(Math.round(parsedAmount * 100) - parsedAmount * 100) > 1e-7) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const rzpOrder = await razorpay!.orders.create({
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
    return res
      .status(500)
      .json({ error: "Failed to create wallet payment order" });
  }
});

// Verify wallet top-up payment and credit balance
router.post("/verify-wallet-payment", async (req: AuthRequest, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (
      !validSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)
    ) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Fetch order from Razorpay to get the amount
    const [rzpOrder, providerPayment] = await Promise.all([
      razorpay!.orders.fetch(razorpayOrderId), razorpay!.payments.fetch(razorpayPaymentId),
    ]);
    if (
      providerPayment.status !== "captured" ||
      providerPayment.order_id !== razorpayOrderId ||
      Number(providerPayment.amount) !== Number(rzpOrder.amount_paid) ||
      String(rzpOrder.notes?.userId) !== String(req.userId) ||
      rzpOrder.notes?.purpose !== "wallet_topup" ||
      rzpOrder.status !== "paid" ||
      Number(rzpOrder.amount_paid) <= 0
    ) {
      return res
        .status(400)
        .json({
          error:
            "The wallet payment does not belong to this user or has not been captured.",
        });
    }
    const amountInRupees = (rzpOrder.amount_paid as number) / 100;
    const applied = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${razorpayPaymentId}))`,
      );
      const [previous] = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.razorpayPaymentId, razorpayPaymentId))
        .limit(1);
      if (previous) return false;
      await tx
        .insert(walletsTable)
        .values({ userId: req.userId!, balance: amountInRupees.toFixed(2) })
        .onConflictDoUpdate({
          target: walletsTable.userId,
          set: {
            balance: sql`${walletsTable.balance} + ${amountInRupees}`,
            updatedAt: new Date(),
          },
        });
      await tx
        .insert(transactionsTable)
        .values({
          userId: req.userId!,
          type: "credit",
          amount: amountInRupees.toFixed(2),
          razorpayPaymentId,
          description: `Wallet top-up via Razorpay (${razorpayPaymentId})`,
        });
      return true;
    });

    if (applied) {
      const [updatedWallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.userId!)).limit(1);
      notifyWalletTopUp({ userId: req.userId!, paymentId: razorpayPaymentId, credited: amountInRupees,
        newBalance: Number(updatedWallet?.balance ?? 0) })
        .catch((e) => console.error("[WhatsApp] Queue wallet update failed:", e));
    }

    return res.json({ success: true, credited: applied ? amountInRupees : 0 });
  } catch (err) {
    console.error("Razorpay wallet verify error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

export default router;
