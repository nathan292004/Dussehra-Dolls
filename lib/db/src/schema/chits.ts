import { pgTable, serial, text, numeric, integer, timestamp, boolean, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { adminUsersTable } from "./admin-users";

// One row per customer chit plan. A plan starts "under review" (is_approved = false and
// is_rejected = false); an admin then approves or rejects it. Only approved plans can be paid
// for, reminded about, or shown as active.
export const chitPlansTable = pgTable("chit_plans", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.userId),
  name: text("name").notNull(),
  chits: integer("chits").notNull(),
  monthlyAmount: numeric("monthly_amount", { precision: 10, scale: 2 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  bonusPoints: integer("bonus_points").notNull(),
  durationMonths: integer("duration_months").notNull().default(11),
  // Year of the October that starts the plan year this plan belongs to (Oct Y - Aug Y+1).
  cycleStartYear: integer("cycle_start_year").notNull(),
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).default("0").notNull(),
  // Life of an approved plan: "active" -> "completed", or "cancelled".
  status: text("status").notNull().default("active"),
  isApproved: boolean("is_approved").default(false).notNull(),
  isRejected: boolean("is_rejected").default(false).notNull(),
  rejectionReason: text("rejection_reason"),
  reviewedBy: integer("reviewed_by").references(() => adminUsersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check("chit_plans_not_approved_and_rejected", sql`NOT (${t.isApproved} AND ${t.isRejected})`),
  // A customer can have only one plan per plan year that is under review or approved
  // (a rejected or cancelled one does not count). Two requests at the same moment:
  // the database lets one in and refuses the other.
  uniqueIndex("chit_plans_one_per_user_per_year")
    .on(t.userId, t.cycleStartYear)
    .where(sql`${t.isRejected} = false AND ${t.status} <> 'cancelled'`),
  index("chit_plans_user_idx").on(t.userId),
  index("chit_plans_review_idx").on(t.isApproved, t.isRejected),
]);

// One row per reminder due to be sent, so each customer gets the 4th / 10th message once per month
// and failures are recorded and retried instead of lost.
export const chitReminderLogTable = pgTable("chit_reminder_log", {
  id: serial("id").primaryKey(),
  chitPlanId: integer("chit_plan_id").notNull().references(() => chitPlansTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "day4" | "day10"
  periodKey: text("period_key").notNull(), // e.g. "2026-11"
  status: text("status").notNull().default("pending"), // "pending" | "sent" | "failed"
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  amountDue: numeric("amount_due", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => [uniqueIndex("chit_reminder_unique").on(t.chitPlanId, t.kind, t.periodKey)]);

export type ChitPlan = typeof chitPlansTable.$inferSelect;
