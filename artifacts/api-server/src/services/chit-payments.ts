import type Razorpay from "razorpay";
import { db } from "@workspace/db";
import {
  chitEnrollmentsTable, chitPlansTable, chitPaymentIntentsTable,
  transactionsTable, walletsTable, usersTable,
  whatsappPreferencesTable, whatsappMessagesTable,
} from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";

export class PaymentFlowError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}

function paise(amount: string): number {
  return Math.round(Number(amount) * 100);
}

export async function createChitPayment(razorpay: Razorpay, userId: number, enrollmentId: number) {
  if (!Number.isSafeInteger(enrollmentId) || enrollmentId <= 0) throw new PaymentFlowError(400, "Invalid plan enrollment");

  return db.transaction(async tx => {
    const [enrollment] = await tx.select().from(chitEnrollmentsTable)
      .where(and(eq(chitEnrollmentsTable.id, enrollmentId), eq(chitEnrollmentsTable.userId, userId)))
      .for("update").limit(1);
    if (!enrollment) throw new PaymentFlowError(404, "Plan enrollment not found");
    const [plan] = await tx.select().from(chitPlansTable).where(eq(chitPlansTable.id, enrollment.chitPlanId)).limit(1);
    if (!plan || enrollment.status !== "active") throw new PaymentFlowError(409, "This plan is no longer payable");

    const remaining = paise(plan.totalAmount) - paise(enrollment.amountPaid);
    const amountPaise = Math.min(paise(plan.monthlyContribution), remaining);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new PaymentFlowError(409, "This plan is already paid");

    const [pending] = await tx.select().from(chitPaymentIntentsTable)
      .where(and(eq(chitPaymentIntentsTable.enrollmentId, enrollmentId), eq(chitPaymentIntentsTable.status, "pending")))
      .orderBy(sql`${chitPaymentIntentsTable.id} DESC`).limit(1);
    if (pending) {
      const order = await razorpay.orders.fetch(pending.razorpayOrderId);
      if (order.status === "paid") throw new PaymentFlowError(409, "Previous payment is being finalized. Refresh your plan before paying again.");
      if (pending.amountPaise === amountPaise) {
        return { razorpayOrderId: pending.razorpayOrderId, amount: amountPaise, currency: "INR", emi: amountPaise / 100, planName: plan.name };
      }
      await tx.update(chitPaymentIntentsTable).set({ status: "superseded", updatedAt: new Date() })
        .where(eq(chitPaymentIntentsTable.id, pending.id));
    }

    const order = await razorpay.orders.create({
      amount: amountPaise, currency: "INR",
      notes: { purpose: "chit_installment", enrollmentId: String(enrollmentId), userId: String(userId) },
    });
    await tx.insert(chitPaymentIntentsTable).values({
      userId, enrollmentId, razorpayOrderId: order.id, amountPaise,
    });
    return { razorpayOrderId: order.id, amount: amountPaise, currency: "INR", emi: amountPaise / 100, planName: plan.name };
  });
}

export async function settleChitPayment(razorpay: Razorpay, razorpayOrderId: string, razorpayPaymentId: string, expectedUserId?: number) {
  const [intent] = await db.select().from(chitPaymentIntentsTable)
    .where(eq(chitPaymentIntentsTable.razorpayOrderId, razorpayOrderId)).limit(1);
  if (!intent) throw new PaymentFlowError(404, "Installment payment not found");
  if (expectedUserId && intent.userId !== expectedUserId) throw new PaymentFlowError(404, "Installment payment not found");

  const [payment, order] = await Promise.all([
    razorpay.payments.fetch(razorpayPaymentId),
    razorpay.orders.fetch(razorpayOrderId),
  ]);
  if (payment.status !== "captured" || payment.order_id !== razorpayOrderId ||
      Number(payment.amount) !== intent.amountPaise || order.status !== "paid" ||
      String(order.notes?.userId) !== String(intent.userId) ||
      String(order.notes?.enrollmentId) !== String(intent.enrollmentId) ||
      order.notes?.purpose !== "chit_installment") {
    throw new PaymentFlowError(409, "The captured payment does not match this installment");
  }

  return db.transaction(async tx => {
    const [currentIntent] = await tx.select().from(chitPaymentIntentsTable)
      .where(eq(chitPaymentIntentsTable.id, intent.id)).for("update").limit(1);
    const [enrollment] = await tx.select().from(chitEnrollmentsTable)
      .where(eq(chitEnrollmentsTable.id, intent.enrollmentId)).for("update").limit(1);
    if (!currentIntent || !enrollment) throw new PaymentFlowError(404, "Installment payment not found");
    if (currentIntent.status === "captured") {
      if (currentIntent.razorpayPaymentId !== razorpayPaymentId) throw new PaymentFlowError(409, "This installment was paid with another payment");
      return { success: true, applied: false, newAmountPaid: Number(enrollment.amountPaid), isCompleted: enrollment.status === "completed", credited: 0 };
    }
    if (currentIntent.status !== "pending") throw new PaymentFlowError(409, "This payment request is no longer active");
    if (enrollment.userId !== intent.userId || enrollment.status !== "active") throw new PaymentFlowError(409, "This plan is no longer payable");
    const [plan] = await tx.select().from(chitPlansTable).where(eq(chitPlansTable.id, enrollment.chitPlanId)).limit(1);
    if (!plan) throw new PaymentFlowError(404, "Plan not found");
    const totalPaise = paise(plan.totalAmount);
    const paidPaise = paise(enrollment.amountPaid);
    if (paidPaise + intent.amountPaise > totalPaise) throw new PaymentFlowError(409, "Plan balance changed; payment needs review");
    const [prior] = await tx.select({ id: transactionsTable.id }).from(transactionsTable)
      .where(eq(transactionsTable.razorpayPaymentId, razorpayPaymentId)).limit(1);
    if (prior) throw new PaymentFlowError(409, "Payment has already been recorded elsewhere");

    const newPaidPaise = paidPaise + intent.amountPaise;
    const completed = newPaidPaise >= totalPaise;
    const nextPaymentDate = completed ? null : new Date();
    if (nextPaymentDate) nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    await tx.update(chitEnrollmentsTable).set({
      amountPaid: (newPaidPaise / 100).toFixed(2),
      status: completed ? "completed" : "active", nextPaymentDate,
    }).where(eq(chitEnrollmentsTable.id, enrollment.id));
    await tx.insert(walletsTable).values({ userId: intent.userId, balance: (intent.amountPaise / 100).toFixed(2) })
      .onConflictDoUpdate({ target: walletsTable.userId, set: {
        balance: sql`${walletsTable.balance} + ${intent.amountPaise / 100}`,
        updatedAt: new Date(),
      }});
    await tx.insert(transactionsTable).values({
      userId: intent.userId, type: "credit", amount: (intent.amountPaise / 100).toFixed(2),
      razorpayPaymentId, description: `Doll plan installment #${enrollment.id}`,
    });
    await tx.update(chitPaymentIntentsTable).set({
      status: "captured", razorpayPaymentId, updatedAt: new Date(),
    }).where(eq(chitPaymentIntentsTable.id, intent.id));

    const [user] = await tx.select({ phone: usersTable.phone, name: usersTable.name }).from(usersTable)
      .where(eq(usersTable.id, intent.userId)).limit(1);
    const [preference] = await tx.select().from(whatsappPreferencesTable)
      .where(eq(whatsappPreferencesTable.userId, intent.userId)).limit(1);
    if (user?.phone && preference?.orderUpdates) {
      await tx.insert(whatsappMessagesTable).values({
        userId: intent.userId, kind: "chit_payment",
        dedupeKey: `chit-payment:${razorpayPaymentId}`,
        variables: { "1": user.name, "2": plan.name, "3": (intent.amountPaise / 100).toFixed(2), "4": (newPaidPaise / 100).toFixed(2) },
      }).onConflictDoNothing();
    }
    return { success: true, applied: true, newAmountPaid: newPaidPaise / 100, isCompleted: completed, credited: intent.amountPaise / 100 };
  });
}
