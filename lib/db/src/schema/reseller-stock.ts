import { pgTable, serial, text, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vendorsTable } from "./vendors";
import { productsTable } from "./products";
import { adminUsersTable } from "./admin-users";

// One row per batch of dolls a reseller hands over to us ("received") or takes back ("returned").
// Recording an entry also moves products.stock in the same transaction. Rows are never edited or
// deleted: a mistake is corrected with an opposite entry, so the history always adds up.
export const resellerStockEntriesTable = pgTable("reseller_stock_entries", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id),
  // Null if the product was later deleted; product_name keeps the history readable.
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  kind: text("kind").notNull(), // "received" | "returned"
  quantity: integer("quantity").notNull(),
  note: text("note"),
  createdBy: integer("created_by").references(() => adminUsersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("reseller_stock_quantity_positive", sql`${t.quantity} > 0`),
  check("reseller_stock_kind", sql`${t.kind} IN ('received', 'returned')`),
  index("reseller_stock_vendor_idx").on(t.vendorId, t.createdAt),
  index("reseller_stock_product_idx").on(t.productId),
]);

export type ResellerStockEntry = typeof resellerStockEntriesTable.$inferSelect;
