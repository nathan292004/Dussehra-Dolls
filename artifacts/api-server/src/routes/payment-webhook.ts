import crypto from "crypto";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { chitPaymentIntentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { razorpay } from "./payment";
import { settleChitPayment } from "../services/chit-payments";

// Mount with express.raw before express.json. Razorpay signs the original bytes.
export async function paymentWebhook(req: Request, res: Response) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !razorpay) return res.status(503).json({ error: "Payment webhook unavailable" });
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Invalid webhook body" });
  const suppliedHex = req.get("x-razorpay-signature") || "";
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return res.status(401).json({ error: "Invalid signature" });
  const supplied = Buffer.from(suppliedHex, "hex");
  const expected = crypto.createHmac("sha256", secret).update(req.body).digest();
  if (!crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ error: "Invalid signature" });

  try {
    const event = JSON.parse(req.body.toString("utf8")) as {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
    };
    if (event.event !== "payment.captured") return res.json({ ok: true });
    const paymentId = event.payload?.payment?.entity?.id;
    const orderId = event.payload?.payment?.entity?.order_id;
    if (!paymentId || !orderId) return res.status(400).json({ error: "Missing payment identifiers" });
    const [intent] = await db.select({ id: chitPaymentIntentsTable.id })
      .from(chitPaymentIntentsTable).where(eq(chitPaymentIntentsTable.razorpayOrderId, orderId)).limit(1);
    if (!intent) return res.json({ ok: true }); // Other payment types use their existing checkout flow.
    await settleChitPayment(razorpay, orderId, paymentId);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[PaymentWebhook] Could not finalize captured installment:", err);
    return res.status(500).json({ error: "Payment finalization pending" });
  }
}
