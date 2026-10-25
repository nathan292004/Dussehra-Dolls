import { pgTable, serial, text, numeric, integer, boolean, timestamp, jsonb, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  stock: integer("stock").default(0).notNull(),
  // Units held by checkouts that are waiting for payment. Customers can buy at most (stock - reserved_stock).
  reservedStock: integer("reserved_stock").default(0).notNull(),
  rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
  reviewCount: integer("review_count").default(0).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  isListed: boolean("is_listed").default(true).notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  serialNumber: text("serial_number"),
  location: text("location"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Safety nets in the database itself: stock can never go negative, and more can never be held than exists.
  check("products_stock_not_negative", sql`${t.stock} >= 0`),
  check("products_reserved_within_stock", sql`${t.reservedStock} >= 0 AND ${t.reservedStock} <= ${t.stock}`),
]);

export type Product = typeof productsTable.$inferSelect;
