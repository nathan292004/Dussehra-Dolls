import { db } from "@workspace/db";
import { chitEnrollmentsTable, chitPlansTable, usersTable } from "@workspace/db/schema";
import { eq, and, lte, isNotNull, ne } from "drizzle-orm";
import { notifyChitDueReminder } from "./whatsapp-notifications";

const REMINDER_DAYS = [1, 3]; // remind 1 day and 3 days before due

async function sendChitReminders() {
  console.log("[ChitReminder] Running scheduled chit due reminders…");
  try {
    const now = new Date();

    // Find all active enrollments with a nextPaymentDate
    const enrollments = await db
      .select({
        enrollment: chitEnrollmentsTable,
        plan: chitPlansTable,
        user: usersTable,
      })
      .from(chitEnrollmentsTable)
      .leftJoin(chitPlansTable, eq(chitEnrollmentsTable.chitPlanId, chitPlansTable.id))
      .leftJoin(usersTable, eq(chitEnrollmentsTable.userId, usersTable.id))
      .where(
        and(
          eq(chitEnrollmentsTable.status, "active"),
          isNotNull(chitEnrollmentsTable.nextPaymentDate),
        )
      );

    let sent = 0;
    for (const row of enrollments) {
      if (!row.user?.phone || !row.plan || !row.enrollment.nextPaymentDate) continue;

      const dueDate = new Date(row.enrollment.nextPaymentDate);
      const msLeft = dueDate.getTime() - now.getTime();
      const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));

      // Remind on configured reminder days, OR if overdue (up to 7 days past due)
      const shouldRemind =
        REMINDER_DAYS.includes(daysLeft) ||
        (daysLeft < 0 && daysLeft >= -7);

      if (!shouldRemind) continue;

      try {
        await notifyChitDueReminder({
          phone: row.user.phone,
          name: row.user.name || "Customer",
          planName: row.plan.name,
          emiAmount: parseFloat(row.plan.monthlyContribution),
          dueDate,
          daysLeft,
        });
        sent++;
      } catch (e) {
        console.error(`[ChitReminder] Failed for enrollment ${row.enrollment.id}:`, e);
      }
    }

    console.log(`[ChitReminder] Done. Sent ${sent} reminder(s).`);
  } catch (err) {
    console.error("[ChitReminder] Scheduler error:", err);
  }
}

export function startChitReminderScheduler() {
  // Run once at startup (after a short delay to let the server settle)
  setTimeout(sendChitReminders, 30_000);

  // Then run every 24 hours
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  setInterval(sendChitReminders, INTERVAL_MS);

  console.log("[ChitReminder] Scheduler started — will run every 24 hours.");
}
