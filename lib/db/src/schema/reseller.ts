import { pgTable, serial, text, numeric, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

export const resellerCommissionsTable = pgTable("reseller_commissions", {
  id: serial("id").primaryKey(),
  resellerId: text("reseller_id").notNull().references(() => usersTable.userId),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  orderTotal: numeric("order_total", { precision: 10, scale: 2 }).notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("5.00"),
  commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("credited"), // "pending" | "credited"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("reseller_commissions_reseller_idx").on(t.resellerId),
  index("reseller_commissions_order_idx").on(t.orderId),
]);

export type ResellerCommission = typeof resellerCommissionsTable.$inferSelect;
