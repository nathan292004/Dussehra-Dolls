import Razorpay from "razorpay";

/** Shared Razorpay client; null when credentials are not configured. */
export const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

export class PaymentCheckError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Asks Razorpay what really happened to a payment. Only a captured payment that belongs to
 * the given order is accepted. The amount comes from Razorpay (whole paise), never from the app.
 */
export async function loadCapturedPayment(rp: Razorpay, paymentId: string, orderId: string) {
  const payment = await rp.payments.fetch(paymentId);
  if (payment.order_id !== orderId) {
    throw new PaymentCheckError("This payment does not belong to the given order.");
  }
  if (payment.status !== "captured") {
    throw new PaymentCheckError("The payment has not been captured yet.");
  }
  const amountPaise = Number(payment.amount);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new PaymentCheckError("The payment amount is not valid.");
  }
  const order = await rp.orders.fetch(orderId);
  return { amountPaise, order, notes: (order.notes ?? {}) as Record<string, unknown> };
}
