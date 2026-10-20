import { Router, type Request } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { razorpay, loadCapturedPayment, PaymentCheckError } from "../lib/razorpay";
import { ChitPaymentError, applyChitPayment } from "../lib/chit-payments";
import { applyWalletTopUp } from "../lib/wallet-payments";
import { finalizeShopOrderPayment } from "../lib/order-payments";
import { toPaise } from "../lib/money";

// Razorpay calls this URL itself when a payment is captured, so a payment is still recorded
// if the customer closes the app right after paying. It handles chit payments, shop orders
// and wallet top-ups; each is safe to receive more than once.
// Dashboard setup: Settings -> Webhooks -> URL https://<your-api>/api/payment/razorpay-webhook,
// event "payment.captured", and set the same secret as RAZORPAY_WEBHOOK_SECRET.
const router = Router();

function validWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined, secret: string) {
  if (!rawBody || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

router.post("/", async (req: Request, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !razorpay) {
    return res.status(503).json({ error: "Webhook is not configured" });
  }
  if (!validWebhookSignature((req as any).rawBody, req.header("x-razorpay-signature"), secret)) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (req.body?.event !== "payment.captured") return res.json({ ignored: true });

  try {
    const payment = req.body?.payload?.payment?.entity;
    if (!payment?.id || !payment?.order_id) return res.json({ ignored: true });

    let loaded;
    try {
      loaded = await loadCapturedPayment(razorpay, payment.id, payment.order_id);
    } catch (err) {
      if (err instanceof PaymentCheckError) return res.json({ ignored: true });
      throw err;
    }
    const userId = typeof loaded.notes.userId === "string" ? loaded.notes.userId : "";
    if (!userId) return res.json({ ignored: true });

    switch (loaded.notes.purpose) {
      case "chit_payment": {
        const chitPlanId = Number(loaded.notes.chitPlanId);
        if (!Number.isInteger(chitPlanId)) return res.json({ ignored: true });
        await applyChitPayment({
          chitPlanId, userId, razorpayPaymentId: payment.id, amountPaise: loaded.amountPaise,
        });
        break;
      }
      case "wallet_topup":
        await applyWalletTopUp({ userId, razorpayPaymentId: payment.id, amountPaise: loaded.amountPaise });
        break;
      case "shop_order": {
        const [order] = await db.select().from(ordersTable).where(eq(ordersTable.razorpayOrderId, payment.order_id)).limit(1);
        if (!order || order.userId !== userId) return res.json({ ignored: true });
        const onlinePaise = toPaise(order.total) - toPaise(order.walletAmount);
        if (loaded.amountPaise !== onlinePaise) {
          console.error(`[RazorpayWebhook] Order ${order.id}: paid ${loaded.amountPaise} paise, expected ${onlinePaise}. Needs manual review.`);
          return res.json({ ignored: true });
        }
        await finalizeShopOrderPayment(razorpay, {
          orderId: order.id, userId, razorpayPaymentId: payment.id, onlinePaise,
        });
        break;
      }
      default:
        return res.json({ ignored: true });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("[RazorpayWebhook] failed:", err);
    // Rejections that will never succeed on retry get a 200; anything else is retried by Razorpay.
    return res.status(err instanceof ChitPaymentError ? 200 : 500).json({ error: "Could not process webhook" });
  }
});

export default router;
