import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  ordersTable,
  cartItemsTable,
  productsTable,
  chitEnrollmentsTable,
  chitPlansTable,
  transactionsTable,
  walletsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import {
  notifyOrderConfirmed,
  notifyChitEmiPaid,
  notifyWalletTopUp,
} from "../lib/whatsapp-notifications";

const router = Router();
router.use(authMiddleware as any);

const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      })
    : null;

router.use((_req, res, next) => {
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
    const { address } = req.body;
    if (!address?.trim())
      return res.status(400).json({ error: "Delivery address is required" });

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
      notes: { userId: String(req.userId), address },
    });

    // Create a pending DB order
    const [dbOrder] = await db
      .insert(ordersTable)
      .values({
        userId: req.userId!,
        items: orderItems,
        total: total.toFixed(2),
        address,
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
    const providerOrder = await razorpay!.orders.fetch(razorpayOrderId);
    if (
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

    // Send WhatsApp order confirmation (non-blocking)
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (applied && user?.phone) {
      notifyOrderConfirmed({
        phone: user.phone,
        name: user.name || "Customer",
        orderId: order.id,
        total: parseFloat(order.total),
        items: (order.items as any[]).map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          price: i.price,
        })),
      }).catch((e) => console.error("[WhatsApp] Order notify failed:", e));
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

// Create Razorpay order for chit EMI payment
router.post("/create-chit-payment", async (req: AuthRequest, res) => {
  try {
    const { enrollmentId } = req.body;

    const [row] = await db
      .select({ enrollment: chitEnrollmentsTable, plan: chitPlansTable })
      .from(chitEnrollmentsTable)
      .leftJoin(
        chitPlansTable,
        eq(chitEnrollmentsTable.chitPlanId, chitPlansTable.id),
      )
      .where(eq(chitEnrollmentsTable.id, enrollmentId))
      .limit(1);

    if (!row || row.enrollment.userId !== req.userId) {
      return res.status(404).json({ error: "Chit enrollment not found" });
    }

    const emi = parseFloat(row.plan!.monthlyContribution);

    const rzpOrder = await razorpay!.orders.create({
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
    return res
      .status(500)
      .json({ error: "Failed to create chit payment order" });
  }
});

// Verify chit EMI payment
router.post("/verify-chit-payment", async (req: AuthRequest, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      enrollmentId,
    } = req.body;
    if (
      !validSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)
    ) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const [row] = await db
      .select({ enrollment: chitEnrollmentsTable, plan: chitPlansTable })
      .from(chitEnrollmentsTable)
      .leftJoin(
        chitPlansTable,
        eq(chitEnrollmentsTable.chitPlanId, chitPlansTable.id),
      )
      .where(eq(chitEnrollmentsTable.id, enrollmentId))
      .limit(1);

    if (!row || !row.plan || row.enrollment.userId !== req.userId)
      return res.status(404).json({ error: "Enrollment not found" });

    const emi = parseFloat(row.plan!.monthlyContribution);
    const totalAmount = parseFloat(row.plan!.totalAmount);
    const providerOrder = await razorpay!.orders.fetch(razorpayOrderId);
    if (
      String(providerOrder.notes?.userId) !== String(req.userId) ||
      String(providerOrder.notes?.enrollmentId) !== String(enrollmentId) ||
      providerOrder.status !== "paid" ||
      Number(providerOrder.amount_paid) !== Math.round(emi * 100)
    ) {
      return res
        .status(400)
        .json({
          error:
            "The installment payment does not match this enrollment or has not been captured.",
        });
    }
    const { newAmountPaid, isCompleted, applied } = await db.transaction(
      async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${razorpayPaymentId}))`,
        );
        const [current] = await tx
          .select()
          .from(chitEnrollmentsTable)
          .where(eq(chitEnrollmentsTable.id, enrollmentId))
          .for("update");
        const [previous] = await tx
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.razorpayPaymentId, razorpayPaymentId))
          .limit(1);
        if (previous)
          return {
            newAmountPaid: parseFloat(current.amountPaid),
            isCompleted: current.status === "completed",
            applied: false,
          };
        const paid = parseFloat(current.amountPaid) + emi;
        const completed = paid >= totalAmount;
        const nextPayment = new Date();
        nextPayment.setMonth(nextPayment.getMonth() + 1);
        await tx
          .update(chitEnrollmentsTable)
          .set({
            amountPaid: paid.toFixed(2),
            status: completed ? "completed" : "active",
            nextPaymentDate: completed ? null : nextPayment,
          })
          .where(eq(chitEnrollmentsTable.id, enrollmentId));
        await tx
          .insert(transactionsTable)
          .values({
            userId: req.userId!,
            type: "debit",
            amount: emi.toFixed(2),
            razorpayPaymentId,
            description: `Chit EMI – ${row.plan!.name} (${razorpayPaymentId})`,
          });
        return { newAmountPaid: paid, isCompleted: completed, applied: true };
      },
    );

    // Send WhatsApp chit EMI confirmation (non-blocking)
    const [chitUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (applied && chitUser?.phone) {
      const nextDate = isCompleted
        ? null
        : (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            return d;
          })();
      notifyChitEmiPaid({
        phone: chitUser.phone,
        name: chitUser.name || "Customer",
        planName: row.plan!.name,
        emiAmount: emi,
        totalPaid: newAmountPaid,
        totalAmount: totalAmount,
        isCompleted,
        nextPaymentDate: nextDate,
      }).catch((e) => console.error("[WhatsApp] Chit EMI notify failed:", e));
    }

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
    const rzpOrder = await razorpay!.orders.fetch(razorpayOrderId);
    if (
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

    // Fetch updated balance for notification
    const [updatedWallet] = await db
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, req.userId!))
      .limit(1);
    const [walletUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (applied && walletUser?.phone) {
      notifyWalletTopUp({
        phone: walletUser.phone,
        name: walletUser.name || "Customer",
        credited: amountInRupees,
        newBalance: parseFloat(updatedWallet?.balance ?? "0"),
      }).catch((e) => console.error("[WhatsApp] Wallet notify failed:", e));
    }

    return res.json({ success: true, credited: applied ? amountInRupees : 0 });
  } catch (err) {
    console.error("Razorpay wallet verify error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

export default router;
