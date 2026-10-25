import { pgTable, serial, text, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const usersTable = pgTable("users", {
  // Public, permanent id like "user_191026kQzTb" (see lib/user-id in the API). Every other table links to this.
  userId: text("user_id").primaryKey(),
  // Running number in order of registration (1, 2, 3 ...), handy for the admin and for support.
  index: serial("index").notNull().unique(),
  fname: text("fname").notNull(),
  lname: text("lname"),
  // Customers sign up with a phone number only. There is no email.
  phone: text("phone").notNull(),
  // The customer's default delivery address (kept in step with customer_addresses) and its Google Maps link.
  address: text("address"),
  addressLink: text("address_link"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
  isReseller: boolean("is_reseller").default(false).notNull(),
  resellerCode: text("reseller_code").unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // Users are never hard deleted. A deleted account keeps its row (orders, payments and
  // chit history stay linked to it) and its phone number becomes free to register again.
  isDeleted: boolean("is_deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletionReason: text("deletion_reason"), // "account_deleted" | "password_reset"
  // Login lockout: 5 wrong passwords locks the account for 15 minutes.
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  // Last time the app made an authenticated request. A customer who has not used the app for
  // 60 days is signed out (see middlewares/auth.ts).
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // At most one live (not deleted) account per phone number, enforced by the database.
  uniqueIndex("users_active_phone_unique").on(t.phone).where(sql`${t.isDeleted} = false`),
]);

export type User = typeof usersTable.$inferSelect;
