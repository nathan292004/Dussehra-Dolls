import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  whatsappCampaignsTable,
  whatsappMessagesTable,
  whatsappPreferencesTable,
} from "@workspace/db/schema";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getWhatsAppConfiguration } from "../lib/whatsapp-configuration";

// Mounted under /admin, which routes/index.ts already gates with requireAdmin.
const router = Router();
const eligible = and(
  eq(whatsappPreferencesTable.marketing, true),
  eq(usersTable.isActive, true),
  sql`${usersTable.phone} ~ '^[+]?[1-9][0-9]{7,14}$'`,
);

router.get("/summary", async (req, res) => {
  const [[subscribers], [registered], messages, connection] = await Promise.all(
    [
      db
        .select({ value: count() })
        .from(usersTable)
        .innerJoin(
          whatsappPreferencesTable,
          eq(usersTable.userId, whatsappPreferencesTable.userId),
        )
        .where(eligible),
      db
        .select({ value: count() })
        .from(usersTable)
        .where(eq(usersTable.isActive, true)),
      db
        .select({ status: whatsappMessagesTable.status, value: count() })
        .from(whatsappMessagesTable)
        .groupBy(whatsappMessagesTable.status),
      getWhatsAppConfiguration(req.query.refresh === "true"),
    ],
  );
  return res.json({
    marketingSubscribers: Number(subscribers.value),
    registeredCustomers: Number(registered.value),
    messageCounts: Object.fromEntries(
      messages.map((row) => [row.status, Number(row.value)]),
    ),
    connection,
  });
});

router.get("/audience", async (req, res) => {
  const search = String(req.query.search || "")
    .trim()
    .slice(0, 80);
  const customerName = sql<string>`concat_ws(' ', ${usersTable.fname}, ${usersTable.lname})`;
  const rows = await db
    .select({
      id: usersTable.userId,
      name: customerName,
      phone: usersTable.phone,
    })
    .from(usersTable)
    .innerJoin(
      whatsappPreferencesTable,
      eq(usersTable.userId, whatsappPreferencesTable.userId),
    )
    .where(
      and(
        eligible,
        search
          ? or(
              ilike(customerName, `%${search}%`),
              ilike(usersTable.phone, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(customerName, usersTable.userId)
    .limit(50);
  return res.json(rows);
});

router.get("/campaigns", async (_req, res) => {
  const campaigns = await db
    .select()
    .from(whatsappCampaignsTable)
    .orderBy(desc(whatsappCampaignsTable.createdAt))
    .limit(50);
  const counts = campaigns.length
    ? await db
        .select({
          campaignId: whatsappMessagesTable.campaignId,
          status: whatsappMessagesTable.status,
          value: count(),
        })
        .from(whatsappMessagesTable)
        .where(
          inArray(
            whatsappMessagesTable.campaignId,
            campaigns.map((row) => row.id),
          ),
        )
        .groupBy(whatsappMessagesTable.campaignId, whatsappMessagesTable.status)
    : [];
  return res.json(
    campaigns.map((campaign) => ({
      ...campaign,
      counts: Object.fromEntries(
        counts
          .filter((row) => row.campaignId === campaign.id)
          .map((row) => [row.status, Number(row.value)]),
      ),
    })),
  );
});

router.post("/campaigns", async (req, res) => {
  const {
    campaignId,
    title: rawTitle,
    offer: rawOffer,
    audience,
    recipientIds: rawIds,
  } = req.body || {};
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const offer = typeof rawOffer === "string" ? rawOffer.trim() : "";
  if (
    typeof campaignId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      campaignId,
    )
  ) {
    return res
      .status(400)
      .json({
        error:
          "A valid campaign request ID is required. Refresh the page and try again.",
      });
  }
  if (title.length < 3 || title.length > 80)
    return res
      .status(400)
      .json({ error: "Campaign name must be 3–80 characters." });
  if (
    offer.length < 5 ||
    offer.length > 200 ||
    /[\r\n\t]/.test(offer) ||
    / {5}/.test(offer)
  ) {
    return res
      .status(400)
      .json({
        error:
          "Offer must be 5–200 characters on one line, without tabs or repeated spaces.",
      });
  }
  if (audience !== "all" && audience !== "selected")
    return res.status(400).json({ error: "Choose an audience." });
  if (
    audience === "selected" &&
    (!Array.isArray(rawIds) ||
      rawIds.length < 1 ||
      rawIds.length > 5000 ||
      rawIds.some((id) => typeof id !== "string" || !id))
  ) {
    return res
      .status(400)
      .json({ error: "Choose between 1 and 5,000 subscribed customers." });
  }
  const ids: string[] =
    audience === "selected" ? [...new Set<string>(rawIds)] : [];
  const [previous] = await db
    .select()
    .from(whatsappCampaignsTable)
    .where(eq(whatsappCampaignsTable.id, campaignId));
  if (previous) {
    const previousIds =
      audience === "selected"
        ? (
            await db
              .select({ userId: whatsappMessagesTable.userId })
              .from(whatsappMessagesTable)
              .where(eq(whatsappMessagesTable.campaignId, campaignId))
          )
            .map((row) => row.userId)
            .sort()
        : [];
    if (
      previous.title !== title ||
      previous.offer !== offer ||
      previous.audience !== audience ||
      JSON.stringify(previousIds) !== JSON.stringify(ids.sort())
    ) {
      return res
        .status(409)
        .json({
          error:
            "This request was already used for a different campaign. Reload before composing another.",
        });
    }
    return res.json({
      campaignId,
      queued: previous.recipientCount,
      reused: true,
    });
  }
  const connection = await getWhatsAppConfiguration(true);
  if (!connection.ready || !connection.template)
    return res.status(503).json({ error: connection.message });
  const template = connection.template;
  const result = await db.transaction(async (tx) => {
    // Serialize submissions with an identical request ID.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${campaignId}))`,
    );
    const [existing] = await tx
      .select()
      .from(whatsappCampaignsTable)
      .where(eq(whatsappCampaignsTable.id, campaignId));
    if (existing) {
      const previousIds =
        audience === "selected"
          ? (
              await tx
                .select({ userId: whatsappMessagesTable.userId })
                .from(whatsappMessagesTable)
                .where(eq(whatsappMessagesTable.campaignId, campaignId))
            )
              .map((row) => row.userId)
              .sort()
          : [];
      if (
        existing.title !== title ||
        existing.offer !== offer ||
        existing.audience !== audience ||
        JSON.stringify(previousIds) !==
          JSON.stringify(ids.sort())
      ) {
        return {
          error:
            "This request was already used for a different campaign. Reload before composing another.",
          status: 409,
        };
      }
      return { campaignId, queued: existing.recipientCount, reused: true };
    }
    const recipients = await tx
      .select({ userId: usersTable.userId })
      .from(usersTable)
      .innerJoin(
        whatsappPreferencesTable,
        eq(usersTable.userId, whatsappPreferencesTable.userId),
      )
      .where(
        and(
          eligible,
          audience === "selected" ? inArray(usersTable.userId, ids) : undefined,
        ),
      )
      .limit(5001);
    if (!recipients.length)
      return { error: "There are no subscribed customers in this audience." };
    if (recipients.length > 5000)
      return { error: "Choose up to 5,000 customers per campaign." };
    if (audience === "selected" && recipients.length !== ids.length)
      return {
        error:
          "Some selected customers are no longer subscribed. Refresh the audience and try again.",
      };
    await tx
      .insert(whatsappCampaignsTable)
      .values({
        id: campaignId,
        title,
        offer,
        audience,
        templateName: template.name,
        templateLanguage: template.language,
        templateBody: template.body,
        recipientCount: recipients.length,
      });
    for (let i = 0; i < recipients.length; i += 500) {
      await tx
        .insert(whatsappMessagesTable)
        .values(
          recipients
            .slice(i, i + 500)
            .map(({ userId }) => ({
              userId,
              campaignId,
              kind: "marketing",
              variables: { "1": offer },
              dedupeKey: `campaign:${campaignId}:${userId}`,
            })),
        );
    }
    return { campaignId, queued: recipients.length, reused: false };
  });
  if ("error" in result)
    return res.status(result.status || 400).json({ error: result.error });
  return res.status(result.reused ? 200 : 201).json(result);
});

router.get("/campaigns/:id/messages", async (req, res) => {
  const offset = Math.max(0, Math.min(5000, Number(req.query.offset) || 0));
  const rows = await db
    .select({
      id: whatsappMessagesTable.id,
      customerName: sql<string>`concat_ws(' ', ${usersTable.fname}, ${usersTable.lname})`,
      phone: usersTable.phone,
      status: whatsappMessagesTable.status,
      errorCode: whatsappMessagesTable.providerErrorCode,
      updatedAt: whatsappMessagesTable.updatedAt,
    })
    .from(whatsappMessagesTable)
    .innerJoin(usersTable, eq(usersTable.userId, whatsappMessagesTable.userId))
    .where(eq(whatsappMessagesTable.campaignId, req.params.id))
    .orderBy(whatsappMessagesTable.id)
    .limit(50)
    .offset(Math.floor(offset));
  return res.json(rows);
});

router.post("/campaigns/:id/cancel", async (req, res) => {
  const rows = await db
    .update(whatsappMessagesTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(whatsappMessagesTable.campaignId, req.params.id),
        eq(whatsappMessagesTable.status, "queued"),
      ),
    )
    .returning({ id: whatsappMessagesTable.id });
  return res.json({ cancelled: rows.length });
});

export default router;
