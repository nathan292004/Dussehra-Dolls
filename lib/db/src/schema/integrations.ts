import { pgTable, serial, integer, text, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { chitEnrollmentsTable } from "./chits";

// A Razorpay order is bound to one enrollment and one server-calculated amount.
export const chitPaymentIntentsTable = pgTable("chit_payment_intents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  enrollmentId: integer("enrollment_id").notNull().references(() => chitEnrollmentsTable.id),
  razorpayOrderId: text("razorpay_order_id").notNull().unique(),
  amountPaise: integer("amount_paise").notNull(),
  status: text("status").notNull().default("pending"),
  razorpayPaymentId: text("razorpay_payment_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => [index("chit_payment_intents_enrollment_idx").on(table.enrollmentId, table.status)]);

export const whatsappPreferencesTable = pgTable("whatsapp_preferences", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id),
  orderUpdates: boolean("order_updates").notNull().default(false),
  orderUpdatesOptedAt: timestamp("order_updates_opted_at"),
  marketing: boolean("marketing").notNull().default(false),
  marketingOptedAt: timestamp("marketing_opted_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Durable queue. Provider API acceptance and delivery are separate states.
export const whatsappCampaignsTable = pgTable("whatsapp_campaigns", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  offer: text("offer").notNull(),
  audience: text("audience").notNull(),
  templateName: text("template_name").notNull(),
  templateLanguage: text("template_language").notNull(),
  templateBody: text("template_body").notNull(),
  recipientCount: integer("recipient_count").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const whatsappMessagesTable = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  campaignId: text("campaign_id").references(() => whatsappCampaignsTable.id),
  kind: text("kind").notNull(),
  dedupeKey: text("dedupe_key").unique(),
  variables: jsonb("variables").$type<Record<string, string>>().notNull(),
  status: text("status").notNull().default("queued"),
  providerSid: text("provider_sid").unique(),
  providerErrorCode: text("provider_error_code"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => [index("whatsapp_messages_ready_idx").on(table.status, table.nextAttemptAt, table.id),
  index("whatsapp_messages_campaign_idx").on(table.campaignId, table.status)]);
