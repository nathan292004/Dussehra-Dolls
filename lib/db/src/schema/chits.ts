import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const chitPlansTable = pgTable("chit_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  monthlyContribution: numeric("monthly_contribution", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(),
  maxMembers: integer("max_members").notNull(),
  currentMembers: integer("current_members").default(0).notNull(),
  startDate: timestamp("start_date"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chitEnrollmentsTable = pgTable("chit_enrollments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  chitPlanId: integer("chit_plan_id").notNull().references(() => chitPlansTable.id),
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).default("0").notNull(),
  nextPaymentDate: timestamp("next_payment_date"),
  status: text("status").notNull().default("active"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const insertChitPlanSchema = createInsertSchema(chitPlansTable).omit({ id: true, createdAt: true });
export const insertChitEnrollmentSchema = createInsertSchema(chitEnrollmentsTable).omit({ id: true, joinedAt: true });
export type InsertChitPlan = z.infer<typeof insertChitPlanSchema>;
export type ChitPlan = typeof chitPlansTable.$inferSelect;
export type InsertChitEnrollment = z.infer<typeof insertChitEnrollmentSchema>;
export type ChitEnrollment = typeof chitEnrollmentsTable.$inferSelect;
