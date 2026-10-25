import { pgTable, serial, text, numeric, timestamp, jsonb, boolean, doublePrecision, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.userId),
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  razorpayOrderId: text("razorpay_order_id").unique(),
  items: jsonb("items").$type<Array<{
    productId: number;
    productName: string;
    quantity: number;
    price: number;
    subtotal: number;
  }>>().notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  // Part of the total paid from the customer's wallet (the rest is paid online).
  walletAmount: numeric("wallet_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  // True while this unpaid checkout is holding stock for its items (products.reserved_stock).
  // Cleared exactly once: when the order is paid (stock sold) or cancelled/expired (stock released).
  stockReserved: boolean("stock_reserved").default(false).notNull(),
  address: text("address"),
  addressLatitude: doublePrecision("address_latitude"),
  addressLongitude: doublePrecision("address_longitude"),
  addressLink: text("address_link"),
  paymentMethod: text("payment_method"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("orders_user_idx").on(t.userId, t.createdAt),
  index("orders_status_idx").on(t.status, t.paymentStatus),
]);

export type Order = typeof ordersTable.$inferSelect;
