import { db } from "@workspace/db";
import {
  chitPlansTable,
  chitReminderLogTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { notifyChitMonthlyDue, notifyChitSecondReminder } from "./whatsapp-notifications";
import {
  REMINDER_DAY_FIRST,
  REMINDER_DAY_SECOND,
  cycleMonthNames,
  istParts,
} from "./chit-rules";
import { chitPlanDue } from "./chit-view";
import { toRupees } from "./money";

// Messages go out from this hour (IST) on the reminder days.
const SEND_FROM_HOUR_IST = 10;
const CHECK_EVERY_MS = 60 * 60 * 1000;
// A failed reminder is retried on the next hourly checks, up to this many tries in total.
const MAX_ATTEMPTS = 3;
// A reminder claimed but never finished (the process died mid-send) can be taken over after this long.
const STALE_CLAIM_MINUTES = 15;

type ReminderKind = "day4" | "day10";

/**
 * Claims one reminder for sending, atomically. Returns the log row id if this process now owns
 * the send, or null if it was already sent / is being sent / has used up its retries.
 * Several servers can run this at once: the database lets only one of them win.
 */
async function claimReminder(chitPlanId: number, kind: ReminderKind, periodKey: string, amountDue: string) {
  const [created] = await db
    .insert(chitReminderLogTable)
    .values({ chitPlanId, kind, periodKey, status: "pending", attempts: 1, amountDue })
    .onConflictDoNothing()
    .returning({ id: chitReminderLogTable.id });
  if (created) return created.id;

  // It already exists. Retry it only if it failed (and tries remain) or a sender died midway.
  const [retry] = await db
    .update(chitReminderLogTable)
    .set({
      status: "pending",
      attempts: sql`${chitReminderLogTable.attempts} + 1`,
      amountDue,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(chitReminderLogTable.chitPlanId, chitPlanId),
        eq(chitReminderLogTable.kind, kind),
        eq(chitReminderLogTable.periodKey, periodKey),
        sql`${chitReminderLogTable.attempts} < ${MAX_ATTEMPTS}`,
        sql`(${chitReminderLogTable.status} = 'failed'
             OR (${chitReminderLogTable.status} = 'pending'
                 AND ${chitReminderLogTable.updatedAt} < now() - make_interval(mins => ${STALE_CLAIM_MINUTES})))`,
      ),
    )
    .returning({ id: chitReminderLogTable.id });
  return retry?.id ?? null;
}

/**
 * On the 4th: remind everyone who has an amount pending (anyone who has paid is skipped).
 * On the 10th: remind again, only those who still have an amount pending.
 * Every reminder is recorded (sent or failed); failures are retried a few times.
 */
export async function sendChitReminders(now: Date = new Date()) {
  const p = istParts(now);
  const kind: ReminderKind | null =
    p.day === REMINDER_DAY_FIRST ? "day4" : p.day === REMINDER_DAY_SECOND ? "day10" : null;
  if (!kind || p.hour < SEND_FROM_HOUR_IST) return { sent: 0, failed: 0 };

  const periodKey = `${p.year}-${String(p.month + 1).padStart(2, "0")}`;
  console.log(`[ChitReminder] Running ${kind} reminders for ${periodKey}`);

  let sent = 0;
  let failed = 0;
  try {
    const rows = await db
      .select({ plan: chitPlansTable, user: usersTable })
      .from(chitPlansTable)
      .innerJoin(usersTable, eq(chitPlansTable.userId, usersTable.userId))
      // Only approved, still-running plans of live accounts are reminded.
      .where(
        and(
          eq(chitPlansTable.isApproved, true),
          eq(chitPlansTable.isRejected, false),
          eq(chitPlansTable.status, "active"),
          eq(usersTable.isDeleted, false),
        ),
      );

    for (const { plan, user } of rows) {
      const due = chitPlanDue(plan, now);
      if (due.monthsDue === 0 || due.outstandingPaise <= 0) continue; // nothing pending: ignore

      const claimId = await claimReminder(plan.id, kind, periodKey, String(due.outstanding));
      if (claimId === null) continue;

      const message = {
        phone: user.phone,
        name: [user.fname, user.lname].filter(Boolean).join(" ") || "Customer",
        userId: user.userId,
        chitPlanId: plan.id,
        planName: plan.name,
        monthName: cycleMonthNames()[due.monthsDue - 1],
        monthlyAmount: toRupees(plan.monthlyAmount),
        totalPending: due.outstanding,
      };
      try {
        const ok = kind === "day4"
          ? await notifyChitMonthlyDue(message)
          : await notifyChitSecondReminder(message);
        if (!ok) throw new Error("WhatsApp provider did not accept the message");
        await db
          .update(chitReminderLogTable)
          .set({ status: "sent", sentAt: new Date(), lastError: null, updatedAt: new Date() })
          .where(eq(chitReminderLogTable.id, claimId));
        sent++;
      } catch (e) {
        await db
          .update(chitReminderLogTable)
          .set({ status: "failed", lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500), updatedAt: new Date() })
          .where(eq(chitReminderLogTable.id, claimId));
        failed++;
        console.error(`[ChitReminder] Failed for chit plan ${plan.id}:`, e);
      }
    }
    console.log(`[ChitReminder] Done. Sent ${sent}, failed ${failed} (${kind}).`);
  } catch (err) {
    console.error("[ChitReminder] Scheduler error:", err);
  }
  return { sent, failed };
}

export function startChitReminderScheduler() {
  setTimeout(() => void sendChitReminders(), 30_000);
  setInterval(() => void sendChitReminders(), CHECK_EVERY_MS);
  console.log(
    `[ChitReminder] Scheduler started: checks hourly, sends on the ${REMINDER_DAY_FIRST}th and ${REMINDER_DAY_SECOND}th of each month from ${SEND_FROM_HOUR_IST}:00 IST.`,
  );
}
