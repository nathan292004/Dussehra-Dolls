import { db } from "@workspace/db";
import {
  usersTable,
  whatsappCampaignsTable,
  whatsappMessagesTable,
  whatsappPreferencesTable,
} from "@workspace/db/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { MetaWhatsAppError, sendMetaWhatsAppTemplate } from "./meta-whatsapp";

const templates: Record<string, string | undefined> = {
  order_confirmation: process.env.META_WHATSAPP_ORDER_TEMPLATE_NAME,
  chit_payment: process.env.META_WHATSAPP_CHIT_TEMPLATE_NAME,
  wallet_topup: process.env.META_WHATSAPP_WALLET_TEMPLATE_NAME,
  chit_reminder: process.env.META_WHATSAPP_REMINDER_TEMPLATE_NAME,
  marketing: process.env.META_WHATSAPP_PROMO_TEMPLATE_NAME,
};

export async function deliverOne(messageId?: number) {
  // Claim one row so concurrent API instances cannot send it twice.
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(whatsappMessagesTable)
      .where(
        and(
          eq(whatsappMessagesTable.status, "queued"),
          lte(whatsappMessagesTable.nextAttemptAt, sql`CURRENT_TIMESTAMP`),
          messageId === undefined
            ? undefined
            : eq(whatsappMessagesTable.id, messageId),
        ),
      )
      .orderBy(whatsappMessagesTable.id)
      .for("update", { skipLocked: true })
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    await tx
      .update(whatsappMessagesTable)
      .set({
        status: "sending",
        attempts: row.attempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessagesTable.id, row.id));
    return row;
  });
  if (!claimed) return false;
  const [recipient] = await db
    .select({
      phone: usersTable.phone,
      active: usersTable.isActive,
      orderUpdates: whatsappPreferencesTable.orderUpdates,
      marketing: whatsappPreferencesTable.marketing,
    })
    .from(usersTable)
    .leftJoin(
      whatsappPreferencesTable,
      eq(usersTable.id, whatsappPreferencesTable.userId),
    )
    .where(eq(usersTable.id, claimed.userId))
    .limit(1);
  const allowed =
    recipient?.active &&
    recipient.phone &&
    (claimed.kind === "marketing"
      ? recipient.marketing
      : recipient.orderUpdates);
  if (!allowed) {
    await db
      .update(whatsappMessagesTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(whatsappMessagesTable.id, claimed.id));
    return true;
  }
  const [campaign] = claimed.campaignId
    ? await db
        .select()
        .from(whatsappCampaignsTable)
        .where(eq(whatsappCampaignsTable.id, claimed.campaignId))
        .limit(1)
    : [];
  const template = campaign?.templateName || templates[claimed.kind];
  if (
    !template ||
    !process.env.META_WHATSAPP_ACCESS_TOKEN ||
    !process.env.META_WHATSAPP_PHONE_NUMBER_ID
  ) {
    await db
      .update(whatsappMessagesTable)
      .set({
        status: "queued",
        attempts: sql`${whatsappMessagesTable.attempts} - 1`,
        nextAttemptAt: new Date(Date.now() + 60_000),
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessagesTable.id, claimed.id));
    return true;
  }
  try {
    const sent = await sendMetaWhatsAppTemplate(
      recipient.phone!,
      template,
      claimed.variables,
      campaign?.templateLanguage,
      `dolldime:${claimed.id}`,
    );
    try {
      await db
        .update(whatsappMessagesTable)
        .set({
          status: "accepted",
          providerSid: sent.id,
          providerErrorCode: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappMessagesTable.id, claimed.id),
            eq(whatsappMessagesTable.status, "sending"),
          ),
        );
    } catch {
      throw new MetaWhatsAppError(
        "Could not record Meta's acceptance",
        "ACCEPTANCE_SAVE_UNCONFIRMED",
        false,
        true,
      );
    }
  } catch (error) {
    console.error(
      "[WhatsApp] Send failed:",
      error instanceof Error ? error.message : String(error),
    );
    const providerError = error instanceof MetaWhatsAppError ? error : null;
    await db
      .update(whatsappMessagesTable)
      .set({
        status: providerError?.ambiguous
          ? "uncertain"
          : providerError?.retryable && claimed.attempts < 4
            ? "queued"
            : "failed",
        providerErrorCode: providerError?.code || "SEND_ERROR",
        nextAttemptAt: new Date(
          Date.now() + Math.min(60, 2 ** claimed.attempts) * 60_000,
        ),
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessagesTable.id, claimed.id));
  }
  return true;
}

export function startWhatsAppWorker() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      // A crashed sender may already have submitted a message. Do not resend it blindly.
      await db
        .update(whatsappMessagesTable)
        .set({
          status: "uncertain",
          providerErrorCode: "SENDER_INTERRUPTED",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappMessagesTable.status, "sending"),
            lte(
              whatsappMessagesTable.updatedAt,
              new Date(Date.now() - 5 * 60_000),
            ),
          ),
        );
      for (let i = 0; i < 10 && (await deliverOne()); i++);
    } catch (error) {
      console.error("[WhatsApp] Worker error:", error);
    } finally {
      running = false;
    }
  };
  setInterval(run, 10_000);
  void run();
}
