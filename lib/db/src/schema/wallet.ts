import { pgTable, serial, text, numeric, timestamp, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => usersTable.userId),
  balance: numeric("balance", { precision: 10, scale: 2 }).default("0").notNull(),
  // Money paid into chit plans. Not spendable until the plan completes (then it moves to balance).
  chitLockedBalance: numeric("chit_locked_balance", { precision: 10, scale: 2 }).default("0").notNull(),
  // False while the customer has an approved chit plan that is not fully paid. The wallet cannot be
  // spent until the last chit payment is made, which sets it back to true.
  isReleased: boolean("is_released").default(true).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // A wallet can never go below zero, whatever the application does.
  check("wallets_balance_not_negative", sql`${t.balance} >= 0 AND ${t.chitLockedBalance} >= 0`),
]);

export const transactionsTable = pgTable("transactions", {
  razorpayPaymentId: text("razorpay_payment_id").unique(),
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.userId),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("transactions_user_idx").on(t.userId, t.createdAt)]);

export type Wallet = typeof walletsTable.$inferSelect;
export type Transaction = typeof transactionsTable.$inferSelect;
