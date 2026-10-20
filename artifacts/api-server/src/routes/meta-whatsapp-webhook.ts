import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  whatsappMessagesTable,
  whatsappPreferencesTable,
} from "@workspace/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export function verifyMetaWhatsAppWebhook(req: Request, res: Response) {
  const token = process.env.META_WHATSAPP_VERIFY_TOKEN;
  if (
    token &&
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === token
  ) {
    return res.status(200).send(String(req.query["hub.challenge"] || ""));
  }
  return res.sendStatus(403);
}

export async function receiveMetaWhatsAppWebhook(req: Request, res: Response) {
  const secret = process.env.META_APP_SECRET;
  const header = req.get("x-hub-signature-256") || "";
  const match = /^sha256=([a-f0-9]{64})$/i.exec(header);
  if (!secret || !Buffer.isBuffer(req.body) || !match)
    return res.sendStatus(403);
  const expected = createHmac("sha256", secret).update(req.body).digest();
  const actual = Buffer.from(match[1], "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return res.sendStatus(403);

  let payload: any;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.sendStatus(400);
  }
  if (payload?.object !== "whatsapp_business_account")
    return res.sendStatus(200);
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (
        change.field !== "messages" ||
        String(change.value?.metadata?.phone_number_id || "") !==
          process.env.META_WHATSAPP_PHONE_NUMBER_ID
      )
        continue;
      for (const message of change.value?.messages || []) {
        const text = String(
          message.text?.body ||
            message.button?.text ||
            message.interactive?.button_reply?.title ||
            "",
        )
          .trim()
          .toLowerCase();
        const from = String(message.from || "");
        if (
          !["stop", "unsubscribe", "stop promotions", "stop offers"].includes(
            text,
          ) ||
          !/^[1-9]\d{7,14}$/.test(from)
        )
          continue;
        const stopAll = text === "stop" || text === "unsubscribe";
        const recipients = await db
          .select({ userId: usersTable.userId })
          .from(usersTable)
          .where(
            sql`regexp_replace(${usersTable.phone}, '[^0-9]', '', 'g') = ${from}`,
          );
        for (const recipient of recipients) {
          await db.transaction(async (tx) => {
            await tx
              .insert(whatsappPreferencesTable)
              .values({ userId: recipient.userId, marketing: false })
              .onConflictDoUpdate({
                target: whatsappPreferencesTable.userId,
                set: {
                  marketing: false,
                  ...(stopAll ? { orderUpdates: false } : {}),
                  updatedAt: new Date(),
                },
              });
            await tx
              .update(whatsappMessagesTable)
              .set({ status: "cancelled", updatedAt: new Date() })
              .where(
                and(
                  eq(whatsappMessagesTable.userId, recipient.userId),
                  stopAll
                    ? undefined
                    : eq(whatsappMessagesTable.kind, "marketing"),
                  eq(whatsappMessagesTable.status, "queued"),
                ),
              );
          });
        }
      }
      for (const event of change.value?.statuses || []) {
        const id = event?.id;
        const status = event?.status;
        if (
          typeof id !== "string" ||
          !["sent", "delivered", "read", "failed"].includes(status)
        )
          continue;
        let [current] = await db
          .select()
          .from(whatsappMessagesTable)
          .where(eq(whatsappMessagesTable.providerSid, id))
          .limit(1);
        // A status callback may arrive before the send response has been saved.
        const reference = /^dolldime:(\d+)$/.exec(
          String(event.biz_opaque_callback_data || ""),
        );
        if (
          !current &&
          reference &&
          Number.isSafeInteger(Number(reference[1]))
        ) {
          [current] = await db
            .select()
            .from(whatsappMessagesTable)
            .where(
              and(
                eq(whatsappMessagesTable.id, Number(reference[1])),
                isNull(whatsappMessagesTable.providerSid),
              ),
            )
            .limit(1);
          if (current && !["sending", "uncertain"].includes(current.status))
            continue;
        }
        if (!current) continue;
        const rank: Record<string, number> = {
          accepted: 0,
          sent: 1,
          delivered: 2,
          read: 3,
        };
        if (
          status === "failed" &&
          ["delivered", "read"].includes(current.status)
        )
          continue;
        if (status !== "failed" && (rank[current.status] ?? -1) > rank[status])
          continue;
        await db
          .update(whatsappMessagesTable)
          .set({
            status,
            providerSid: id,
            providerErrorCode:
              status === "failed"
                ? String(event.errors?.[0]?.code || "unknown")
                : null,
            updatedAt: new Date(),
          })
          .where(eq(whatsappMessagesTable.id, current.id));
      }
    }
  }
  return res.sendStatus(200);
}
