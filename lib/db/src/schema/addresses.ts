import { pgTable, serial, text, timestamp, boolean, doublePrecision, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const customerAddressesTable = pgTable("customer_addresses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.userId, { onDelete: "cascade" }),
  label: text("label").notNull().default("Home"),
  recipientName: text("recipient_name").notNull(),
  phone: text("phone").notNull(),
  // The full delivery address as one line, built from the fields below plus the map pin.
  formattedAddress: text("formatted_address").notNull(),
  // What a courier needs: where exactly, in which building, near what.
  flatNumber: text("flat_number"),
  building: text("building"),
  street: text("street"),
  locality: text("locality"),
  landmark: text("landmark"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  // Link that opens the pin in Google Maps.
  addressLink: text("address_link"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("customer_addresses_user_idx").on(table.userId, table.isDefault)]);

export type CustomerAddress = typeof customerAddressesTable.$inferSelect;
