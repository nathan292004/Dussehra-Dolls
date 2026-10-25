import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// Who did what in the admin site. Written for every admin login attempt and every change.
// Rows are only ever added.
export const adminAuditLogTable = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id"),
  adminUsername: text("admin_username"),
  action: text("action").notNull(), // e.g. "login", "login_failed", "logout", "product.update"
  method: text("method"),
  path: text("path"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  statusCode: integer("status_code"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("admin_audit_created_idx").on(t.createdAt),
  index("admin_audit_admin_idx").on(t.adminId, t.createdAt),
]);

export type AdminAuditLog = typeof adminAuditLogTable.$inferSelect;
