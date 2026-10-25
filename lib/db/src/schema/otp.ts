import { pgTable, serial, text, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";

export const otpVerificationsTable = pgTable("otp_verifications", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  // HMAC of the code (never the code itself), see lib/otp.ts.
  otpHash: text("otp_hash").notNull(),
  // What this code may be used for: "register" or "reset". A code for one cannot be used for the other.
  purpose: text("purpose").default("register").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verified: boolean("verified").default(false).notNull(), // true once used
  // Wrong guesses so far; after 5 the code is dead and a new one must be requested.
  attempts: integer("attempts").default(0).notNull(),
  // Soft delete: a code whose SMS failed to send is hidden, never removed.
  isDeleted: boolean("is_deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("otp_phone_created_idx").on(t.phone, t.createdAt)]);
