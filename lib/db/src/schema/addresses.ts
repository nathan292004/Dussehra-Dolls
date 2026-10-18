import { pgTable, serial, integer, text, timestamp, boolean, doublePrecision, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const customerAddressesTable = pgTable("customer_addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Home"),
  recipientName: text("recipient_name").notNull(),
  phone: text("phone").notNull(),
  formattedAddress: text("formatted_address").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => [index("customer_addresses_user_idx").on(table.userId, table.isDefault)]);

export type CustomerAddress = typeof customerAddressesTable.$inferSelect;
