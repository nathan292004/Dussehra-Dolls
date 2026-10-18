import { db } from "@workspace/db";
import { usersTable, whatsappMessagesTable, whatsappPreferencesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type WhatsAppKind = "order_confirmation" | "chit_payment" | "wallet_topup" | "chit_reminder" | "marketing";

export async function queueWhatsApp(userId: number, kind: WhatsAppKind, variables: Record<string, string>, dedupeKey: string) {
  const [recipient] = await db.select({ phone: usersTable.phone, active: usersTable.isActive,
    orderUpdates: whatsappPreferencesTable.orderUpdates, marketing: whatsappPreferencesTable.marketing })
    .from(usersTable).leftJoin(whatsappPreferencesTable, eq(usersTable.id, whatsappPreferencesTable.userId))
    .where(eq(usersTable.id, userId)).limit(1);
  if (!recipient?.active || !recipient.phone || !(kind === "marketing" ? recipient.marketing : recipient.orderUpdates)) return false;
  const inserted = await db.insert(whatsappMessagesTable).values({ userId, kind, variables, dedupeKey })
    .onConflictDoNothing().returning({ id: whatsappMessagesTable.id });
  return inserted.length > 0;
}

export function notifyOrderConfirmed(opts: { userId: number; orderId: number; total: number }) {
  return queueWhatsApp(opts.userId, "order_confirmation", { "1": String(opts.orderId), "2": opts.total.toFixed(2) }, `order:${opts.orderId}`);
}

export function notifyWalletTopUp(opts: { userId: number; paymentId: string; credited: number; newBalance: number }) {
  return queueWhatsApp(opts.userId, "wallet_topup", { "1": opts.credited.toFixed(2), "2": opts.newBalance.toFixed(2) }, `wallet:${opts.paymentId}`);
}

export function notifyChitDueReminder(opts: { userId: number; enrollmentId: number; planName: string; emiAmount: number; dueDate: Date }) {
  const date = opts.dueDate.toISOString().slice(0, 10);
  return queueWhatsApp(opts.userId, "chit_reminder", { "1": opts.planName, "2": opts.emiAmount.toFixed(2), "3": date }, `reminder:${opts.enrollmentId}:${date}`);
}
