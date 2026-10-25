import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  ordersTable,
  cartItemsTable,
  chitPlansTable,
  walletsTable,
  customerAddressesTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth";
import { razorpay } from "../lib/razorpay";
import {
  ChitPaymentError,
  applyChitPayment,
  loadCapturedChitPayment,
} from "../lib/chit-payments";
import { chitPlanDue } from "../lib/chit-view";
import { loadCartLines } from "../lib/cart-lines";
import { applyWalletTopUp } from "../lib/wallet-payments";
import {
  OrderPaymentError,
  debitWalletForOrder,
  finalizeShopOrderPayment,
  notifyOrder,
  releasePendingOrder,
  reserveStock,
  sellStock,
  shortageMessage,
  sweepExpiredCheckouts,
} from "../lib/order-payments";
import { fromPaise, paiseToDecimal, parsePaise, sumPaise, toPaise } from "../lib/money";

const router = Router();
router.use(authMiddleware);

router.use((_req, res, next) => {
  if (!razorpay) {
    res.status(503).json({
      error: "Payments are unavailable. Configure Razorpay credentials in the API environment.",
    });
    return;
  }
  next();
});

// Razorpay will not take an online payment below ₹1.
const MIN_ONLINE_PAISE = 100;
const MAX_WALLET_TOPUP_PAISE = 50_000_00; // ₹50,000 per top-up
const MAX_NOTE_LENGTH = 250; // Razorpay note values are limited to 256 characters

function validSignature(orderId: unknown, paymentId: unknown, signature: unknown): boolean {
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

/**
 * How much of an order the wallet pays. Only the spendable balance counts (never money locked
 * in a chit plan). The part left for the online payment must be at least ₹1, so if the wallet
 * would leave less than that, the wallet pays a little less.
 */
export function walletShareFor(spendablePaise: number, totalPaise: number): number {
  let share = Math.min(Math.max(spendablePaise, 0), totalPaise);
  const remainder = totalPaise - share;
  if (remainder > 0 && remainder < MIN_ONLINE_PAISE && totalPaise >= MIN_ONLINE_PAISE) {
    share = totalPaise - MIN_ONLINE_PAISE;
  }
  return Math.max(0, share);
}

/** The wallet stays closed until every payment of the customer's chit plan is made. */
const walletLocked = () =>
  new OrderPaymentError(
    "Your wallet opens after your last chit payment in August is completed. Until then you can pay online.",
    409,
    "WALLET_LOCKED",
  );

// ─── Shop checkout ───────────────────────────────────────────────────────────
// Create an order from the cart. With useWallet:true the spendable wallet balance pays first:
//   - wallet covers everything -> the order is confirmed straight away, no online payment;
//   - wallet covers part      -> the wallet part is held now and the rest is paid online.
router.post("/create-order", async (req, res) => {
  try {
    // The customer picks one of their saved delivery addresses (flat number, locality, pincode, map pin ...).
    const addressId = Number(req.body?.addressId);
    if (!Number.isInteger(addressId) || addressId < 1) {
      return res.status(400).json({ error: "Please choose a delivery address", code: "ADDRESS_REQUIRED" });
    }
    const [saved] = await db
      .select()
      .from(customerAddressesTable)
      .where(and(eq(customerAddressesTable.id, addressId), eq(customerAddressesTable.userId, req.userId!)))
      .limit(1);
    if (!saved) return res.status(400).json({ error: "That delivery address was not found", code: "ADDRESS_REQUIRED" });
    // What the courier sees: who to deliver to, their phone, and the full address.
    const address = `${saved.recipientName}, ${saved.phone} - ${saved.formattedAddress}`;
    const latitude = saved.latitude;
    const longitude = saved.longitude;
    const addressLink = saved.addressLink;
    const useWallet = req.body?.useWallet === true;
    const userId = req.userId!;

    // Give back abandoned checkouts first, so their stock and wallet money are available again.
    await sweepExpiredCheckouts(razorpay).catch(() => undefined);

    const lines = await loadCartLines(userId);
    if (lines.length === 0) return res.status(400).json({ error: "Cart is empty" });

    // Availability check BEFORE the customer is sent to pay: stock minus what other unpaid
    // checkouts are holding. (The real, race-proof hold happens in the transaction below.)
    const shortages = lines
      .map((l) => ({
        productId: l.productId,
        name: l.product.name,
        requested: l.quantity,
        available: l.product.isListed ? Math.max(l.product.stock - l.product.reservedStock, 0) : 0,
      }))
      .filter((x) => x.available < x.requested);
    if (shortages.length) {
      return res.status(409).json({ error: shortageMessage(shortages), code: "OUT_OF_STOCK", items: shortages });
    }

    const orderItems = lines.map((l) => ({
      productId: l.productId,
      productName: l.product.name,
      quantity: l.quantity,
      price: fromPaise(l.pricePaise),
      subtotal: fromPaise(l.subtotalPaise),
    }));
    const totalPaise = sumPaise(lines.map((l) => l.subtotalPaise));
    if (totalPaise <= 0) return res.status(400).json({ error: "Order total must be more than zero" });

    // First look at the wallet (no lock) to know whether an online payment is needed.
    let estimateWallet = 0;
    if (useWallet) {
      const [w] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
      if (w && !w.isReleased) throw walletLocked();
      estimateWallet = walletShareFor(w ? toPaise(w.balance) : 0, totalPaise);
    }
    const estimateOnline = totalPaise - estimateWallet;

    const rzpOrder =
      estimateOnline > 0
        ? await razorpay!.orders.create({
            amount: estimateOnline,
            currency: "INR",
            notes: { purpose: "shop_order", userId: String(userId), addressId: String(saved.id), address: address.slice(0, MAX_NOTE_LENGTH) },
          })
        : null;

    // Then do the real work under a lock on the wallet.
    const result = await db.transaction(async (tx) => {
      let walletPaise = 0;
      if (useWallet) {
        const [w] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, userId)).for("update");
        if (w && !w.isReleased) throw walletLocked();
        walletPaise = walletShareFor(w ? toPaise(w.balance) : 0, totalPaise);
      }
      if (walletPaise !== estimateWallet) {
        throw new OrderPaymentError("Your wallet balance changed. Please try again.", 409, "WALLET_CHANGED");
      }
      const onlinePaise = totalPaise - walletPaise;

      if (onlinePaise === 0) {
        // The wallet pays everything.
        const [order] = await tx
          .insert(ordersTable)
          .values({
            userId,
            items: orderItems,
            total: paiseToDecimal(totalPaise),
            walletAmount: paiseToDecimal(walletPaise),
            address,
            addressLatitude: latitude,
            addressLongitude: longitude,
            addressLink,
            paymentMethod: "wallet",
            status: "confirmed",
            paymentStatus: "paid",
          })
          .returning();
        await sellStock(tx, orderItems);
        await debitWalletForOrder(tx, userId, walletPaise, `Order #${order.id} (paid from wallet)`);
        await tx.delete(cartItemsTable).where(eq(cartItemsTable.userId, userId));
        return { order, walletPaise, onlinePaise };
      }

      const [order] = await tx
        .insert(ordersTable)
        .values({
          userId,
          items: orderItems,
          total: paiseToDecimal(totalPaise),
          walletAmount: paiseToDecimal(walletPaise),
          address,
          addressLatitude: latitude,
          addressLongitude: longitude,
          addressLink,
          paymentMethod: walletPaise > 0 ? "wallet+razorpay" : "razorpay",
          status: "pending",
          paymentStatus: "pending",
          razorpayOrderId: rzpOrder!.id,
          stockReserved: true,
        })
        .returning();
      // Freeze the items now. If anyone else took the last units in the meantime this fails
      // (the whole transaction is undone) and the customer is told what ran out.
      await reserveStock(tx, orderItems);
      if (walletPaise > 0) {
        // Hold the wallet part now; it is given back if the online payment never happens.
        await debitWalletForOrder(
          tx, userId, walletPaise, `Order #${order.id} (wallet part, held until the online payment completes)`,
        );
      }
      return { order, walletPaise, onlinePaise };
    });

    if (result.onlinePaise === 0) {
      void notifyOrder(result.order);
      return res.json({
        paidByWallet: true,
        orderId: result.order.id,
        total: fromPaise(totalPaise),
        walletUsed: fromPaise(result.walletPaise),
        onlineAmount: 0,
      });
    }
    return res.json({
      paidByWallet: false,
      razorpayOrderId: rzpOrder!.id,
      amount: rzpOrder!.amount, // paise: what Razorpay Checkout must charge
      currency: rzpOrder!.currency,
      dbOrderId: result.order.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      total: fromPaise(totalPaise),
      walletUsed: fromPaise(result.walletPaise),
      onlineAmount: fromPaise(result.onlinePaise),
    });
  } catch (err) {
    if (err instanceof OrderPaymentError) {
      return res.status(err.status).json({ error: err.message, code: err.code, items: err.shortages });
    }
    console.error("Create order error:", err);
    return res.status(500).json({ error: "Failed to create payment order" });
  }
});

// Verify the online payment and confirm the order.
router.post("/verify-order", async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body ?? {};
    const dbOrderId = Number(req.body?.dbOrderId);
    if (!validSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) || !Number.isInteger(dbOrderId)) {
      return res.status(400).json({ error: "Payment verification failed" });
    }
    const [invoice] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, dbOrderId), eq(ordersTable.userId, req.userId!)))
      .limit(1);
    if (!invoice) return res.status(404).json({ error: "Order not found" });
    if (invoice.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ error: "Payment order does not match this purchase." });
    }

    // The online part is the total minus what the wallet already paid.
    const onlinePaise = toPaise(invoice.total) - toPaise(invoice.walletAmount);
    const providerOrder = await razorpay!.orders.fetch(razorpayOrderId);
    if (
      String(providerOrder.notes?.userId) !== String(req.userId) ||
      providerOrder.status !== "paid" ||
      Number(providerOrder.amount_paid) !== onlinePaise
    ) {
      return res.status(400).json({ error: "The purchase payment has not been captured for the expected amount." });
    }

    const outcome = await finalizeShopOrderPayment(razorpay!, {
      orderId: dbOrderId,
      userId: req.userId!,
      razorpayPaymentId,
      onlinePaise,
    });
    if (outcome.kind === "refunded") {
      return res
        .status(409)
        .json({ error: outcome.message, code: outcome.reason === "expired" ? "ORDER_EXPIRED" : "OUT_OF_STOCK" });
    }
    return res.json({
      success: true,
      orderId: outcome.order.id,
      order: {
        ...outcome.order,
        total: fromPaise(toPaise(outcome.order.total)),
        walletAmount: fromPaise(toPaise(outcome.order.walletAmount)),
      },
    });
  } catch (err) {
    console.error("Razorpay verify error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

// The customer closed or failed the online payment: give back the frozen stock and any wallet money.
router.post("/cancel-order", async (req, res) => {
  try {
    const dbOrderId = Number(req.body?.dbOrderId);
    if (!Number.isInteger(dbOrderId)) return res.status(400).json({ error: "dbOrderId is required" });
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, dbOrderId), eq(ordersTable.userId, req.userId!)))
      .limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.paymentStatus === "paid") {
      return res.status(409).json({ error: "This order is already paid and cannot be cancelled here." });
    }
    if (order.status === "cancelled") return res.json({ success: true, alreadyCancelled: true });

    // If Razorpay already took money for it, it must be confirmed, not cancelled.
    if (order.razorpayOrderId) {
      const providerOrder = await razorpay!.orders.fetch(order.razorpayOrderId);
      if (Number(providerOrder.amount_paid) > 0) {
        return res
          .status(409)
          .json({ error: "A payment for this order is being processed. Please check your orders shortly." });
      }
    }
    await releasePendingOrder(order.id, req.userId!);
    return res.json({ success: true });
  } catch (err) {
    console.error("Cancel order error:", err);
    return res.status(500).json({ error: "Could not cancel the order" });
  }
});

// ─── Chit payments ───────────────────────────────────────────────────────────
// Create a Razorpay order for the amount currently pending on a chit plan
// (this month's payment, plus any earlier months not yet paid). Only approved plans can be paid.
router.post("/create-chit-payment", async (req, res) => {
  try {
    const chitPlanId = Number(req.body?.chitPlanId ?? req.body?.enrollmentId);
    if (!Number.isInteger(chitPlanId)) {
      return res.status(400).json({ error: "chitPlanId is required" });
    }

    const [plan] = await db.select().from(chitPlansTable).where(eq(chitPlansTable.id, chitPlanId)).limit(1);
    if (!plan || plan.userId !== req.userId) {
      return res.status(404).json({ error: "Chit plan not found" });
    }
    if (plan.isRejected) return res.status(400).json({ error: "This chit plan was not approved" });
    if (!plan.isApproved) {
      return res.status(400).json({ error: "This chit plan is still under review. You can pay once it is approved." });
    }
    if (plan.status !== "active") {
      return res.status(400).json({
        error: plan.status === "completed" ? "This chit plan is already fully paid" : "This chit plan is no longer open",
      });
    }

    const due = chitPlanDue(plan);
    if (due.outstandingPaise <= 0) {
      return res.status(400).json({ error: "Nothing is due right now. You are paid up for this month." });
    }

    const allowPartial = process.env.RAZORPAY_ALLOW_PARTIAL_PAYMENTS === "true";
    const rzpOrder = await razorpay!.orders.create({
      amount: due.outstandingPaise,
      currency: "INR",
      ...(allowPartial ? { partial_payment: true, first_payment_min_amount: 10000 } : {}),
      notes: {
        purpose: "chit_payment",
        chitPlanId: String(plan.id),
        userId: req.userId!,
      },
    });

    return res.json({
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      emi: fromPaise(toPaise(plan.monthlyAmount)),
      outstanding: due.outstanding,
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: plan.name,
    });
  } catch (err) {
    console.error("Razorpay chit order error:", err);
    return res.status(500).json({ error: "Failed to create chit payment order" });
  }
});

// Verify a chit payment. The amount credited is what Razorpay says it captured,
// not what the app claims. If it is less than what is due, the customer is told
// the payment is incomplete and the balance stays pending.
router.post("/verify-chit-payment", async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body ?? {};
    if (!validSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const payment = await loadCapturedChitPayment(razorpay!, razorpayPaymentId, razorpayOrderId);
    if (payment.userId !== req.userId) {
      return res.status(404).json({ error: "Chit plan not found" });
    }

    const result = await applyChitPayment({
      chitPlanId: payment.chitPlanId,
      userId: payment.userId,
      razorpayPaymentId,
      amountPaise: payment.amountPaise,
    });

    return res.json({
      success: true,
      isCompleted: result.completed,
      newAmountPaid: result.paidTotal,
      received: result.received,
      outstanding: result.outstandingAfter,
      partial: !result.completed && result.outstandingAfter > 0,
      bonusPoints: result.completed ? result.bonusPoints : 0,
    });
  } catch (err) {
    if (err instanceof ChitPaymentError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("Razorpay chit verify error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

// ─── Wallet top-up ───────────────────────────────────────────────────────────
router.post("/create-wallet-payment", async (req, res) => {
  try {
    const amountPaise = parsePaise(req.body?.amount);
    if (amountPaise === null || amountPaise < MIN_ONLINE_PAISE) {
      return res.status(400).json({ error: "Enter an amount of at least ₹1 (up to two decimals)" });
    }
    if (amountPaise > MAX_WALLET_TOPUP_PAISE) {
      return res.status(400).json({ error: "You can add at most ₹50,000 at a time" });
    }

    const rzpOrder = await razorpay!.orders.create({
      amount: amountPaise,
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

router.post("/verify-wallet-payment", async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body ?? {};
    if (!validSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const rzpOrder = await razorpay!.orders.fetch(razorpayOrderId);
    if (
      String(rzpOrder.notes?.userId) !== String(req.userId) ||
      rzpOrder.notes?.purpose !== "wallet_topup" ||
      rzpOrder.status !== "paid" ||
      Number(rzpOrder.amount_paid) <= 0
    ) {
      return res.status(400).json({
        error: "The wallet payment does not belong to this user or has not been captured.",
      });
    }

    const { newBalance } = await applyWalletTopUp({
      userId: req.userId!,
      razorpayPaymentId,
      amountPaise: Number(rzpOrder.amount_paid),
    });
    return res.json({ success: true, balance: newBalance });
  } catch (err) {
    console.error("Razorpay wallet verify error:", err);
    return res.status(500).json({ error: "Wallet payment verification failed" });
  }
});

export default router;
