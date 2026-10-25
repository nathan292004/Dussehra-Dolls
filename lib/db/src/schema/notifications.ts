import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";

// Every WhatsApp/SMS the system sends (or fails to send), so the admin can see what went out.
// OTP codes themselves are never stored here.
export const notificationLogTable = pgTable("notification_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  phone: text("phone").notNull(),
  channel: text("channel").notNull(), // "whatsapp" | "sms"
  kind: text("kind").notNull(), // e.g. "chit_reminder_day4", "order_confirmed", "otp_register"
  status: text("status").notNull(), // "sent" | "failed"
  relatedType: text("related_type"), // "chit_plan" | "order" | ...
  relatedId: integer("related_id"),
  providerId: text("provider_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("notification_log_created_idx").on(t.createdAt),
  index("notification_log_kind_idx").on(t.kind, t.status),
  index("notification_log_user_idx").on(t.userId),
]);

export type NotificationLog = typeof notificationLogTable.$inferSelect;
