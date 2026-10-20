import { db } from "@workspace/db";
import { notificationLogTable } from "@workspace/db/schema";
import { trySendWhatsApp } from "./twilio";

// Everything the system sends goes through here so it is recorded: who, what kind, when, and
// whether the provider accepted it. The admin "Reminders & Tracking" dashboard reads this log.

export type NotificationKind =
  | "order_confirmed"
  | "wallet_topup"
  | "chit_plan_submitted"
  | "chit_plan_approved"
  | "chit_plan_rejected"
  | "chit_payment_received"
  | "chit_payment_partial"
  | "chit_completed"
  | "chit_reminder_day4"
  | "chit_reminder_day10"
  | "otp_register"
  | "otp_reset"
  | "test";

export interface NotifyMeta {
  userId?: string | null;
  kind: NotificationKind;
  relatedType?: "chit_plan" | "order";
  relatedId?: number;
}

export async function recordNotification(
  meta: NotifyMeta,
  channel: "whatsapp" | "sms",
  phone: string,
  outcome: { ok: true; providerId?: string } | { ok: false; error: string },
) {
  try {
    await db.insert(notificationLogTable).values({
      userId: meta.userId ?? null,
      phone,
      channel,
      kind: meta.kind,
      status: outcome.ok ? "sent" : "failed",
      relatedType: meta.relatedType ?? null,
      relatedId: meta.relatedId ?? null,
      providerId: outcome.ok ? outcome.providerId ?? null : null,
      error: outcome.ok ? null : outcome.error.slice(0, 500),
    });
  } catch (err) {
    // Logging must never break the thing being logged.
    console.error("[Notify] could not record notification:", err);
  }
}

/** Sends a WhatsApp message, records the result, and says whether it was sent. */
export async function sendWhatsAppLogged(phone: string, body: string, meta: NotifyMeta): Promise<boolean> {
  const result = await trySendWhatsApp(phone, body);
  await recordNotification(
    meta,
    "whatsapp",
    phone,
    result.ok ? { ok: true, providerId: result.sid } : { ok: false, error: result.error },
  );
  return result.ok;
}
