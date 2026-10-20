import { Router } from "express";
import { db } from "@workspace/db";
import {
  chitPlansTable,
  chitReminderLogTable,
  notificationLogTable,
  ordersTable,
  productsTable,
  transactionsTable,
  usersTable,
  walletsTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getCycleStatus, istParts } from "../lib/chit-rules";
import { loadTrackedChitPlans } from "../lib/chit-tracking";
import { fromPaise, toPaise, toRupees } from "../lib/money";

// Mounted at /api/admin/ops (admin login required, see routes/index.ts).
// One call that feeds the "Reminders & Tracking" dashboard in the admin site.
const router = Router();

const fullName = (u: { fname: string; lname: string | null }) => [u.fname, u.lname].filter(Boolean).join(" ");

router.get("/", async (_req, res) => {
  try {
    const now = new Date();
    const p = istParts(now);
    const periodKey = `${p.year}-${String(p.month + 1).padStart(2, "0")}`;

    // ── Chit payments: who owes what ────────────────────────────────────────
    const tracked = await loadTrackedChitPlans(now);
    const active = tracked.filter((t) => t.reviewStatus === "active");
    const owing = active.filter((t) => t.outstanding > 0);
    const sumRupees = (xs: number[]) => fromPaise(xs.reduce((a, x) => a + toPaise(x), 0));

    const payments = {
      activePlans: active.length,
      completedPlans: tracked.filter((t) => t.reviewStatus === "completed").length,
      paidUp: active.filter((t) => t.paymentStatus === "paid").length,
      pending: active.filter((t) => t.paymentStatus === "pending").length,
      late: active.filter((t) => t.paymentStatus === "overdue").length,
      multiMonthPending: active.filter((t) => t.monthsPending >= 2).length,
      partiallyPaid: active.filter((t) => t.isPartiallyPaid).length,
      neverPaid: active.filter((t) => t.neverPaid).length,
      expectedSoFar: sumRupees(active.map((t) => t.dueToDate)),
      collectedActive: sumRupees(active.map((t) => t.amountPaid)),
      outstandingTotal: sumRupees(owing.map((t) => t.outstanding)),
      monthlyRunRate: sumRupees(active.map((t) => t.monthlyAmount)),
      collectionRate:
        active.length && toPaise(sumRupees(active.map((t) => t.dueToDate))) > 0
          ? Math.round(
              (toPaise(sumRupees(active.map((t) => Math.min(t.amountPaid, t.dueToDate)))) * 100) /
                toPaise(sumRupees(active.map((t) => t.dueToDate))),
            )
          : null,
    };

    const row = (t: (typeof tracked)[number]) => ({
      chitPlanId: t.id,
      planName: t.name,
      customer: t.customer,
      monthlyAmount: t.monthlyAmount,
      amountPaid: t.amountPaid,
      outstanding: t.outstanding,
      monthsPending: t.monthsPending,
      paymentStatus: t.paymentStatus,
      isPartiallyPaid: t.isPartiallyPaid,
      remindersSent: t.remindersSent,
      remindersFailed: t.remindersFailed,
      lastReminderAt: t.lastReminderAt,
    });
    const byOutstanding = (a: (typeof tracked)[number], b: (typeof tracked)[number]) => b.outstanding - a.outstanding;
    const pendingPayments = owing.slice().sort(byOutstanding).map(row);
    const latePayments = owing.filter((t) => t.paymentStatus === "overdue").sort(byOutstanding).map(row);
    const multiMonthPending = owing.filter((t) => t.monthsPending >= 2).sort(byOutstanding).map(row);

    // ── Reminders (the 4th / 10th WhatsApp messages) ────────────────────────
    const reminderTotals = await db
      .select({
        kind: chitReminderLogTable.kind,
        status: chitReminderLogTable.status,
        thisMonth: sql<number>`count(*) filter (where ${chitReminderLogTable.periodKey} = ${periodKey})::int`,
        allTime: sql<number>`count(*)::int`,
      })
      .from(chitReminderLogTable)
      .groupBy(chitReminderLogTable.kind, chitReminderLogTable.status);
    const remCount = (kind: string, status: string, field: "thisMonth" | "allTime") =>
      reminderTotals.find((r) => r.kind === kind && r.status === status)?.[field] ?? 0;
    const kinds = ["day4", "day10"] as const;
    const reminders = {
      periodKey,
      sentThisMonth: kinds.reduce((n, k) => n + remCount(k, "sent", "thisMonth"), 0),
      failedThisMonth: kinds.reduce((n, k) => n + remCount(k, "failed", "thisMonth"), 0),
      sentAllTime: kinds.reduce((n, k) => n + remCount(k, "sent", "allTime"), 0),
      failedAllTime: kinds.reduce((n, k) => n + remCount(k, "failed", "allTime"), 0),
      byKind: kinds.map((k) => ({
        kind: k,
        label: k === "day4" ? "4th of month (everyone with a pending amount)" : "10th of month (still unpaid)",
        sentThisMonth: remCount(k, "sent", "thisMonth"),
        failedThisMonth: remCount(k, "failed", "thisMonth"),
        sentAllTime: remCount(k, "sent", "allTime"),
      })),
      // Customers who owe money but have never been sent a reminder (e.g. approved after the 10th).
      owingNeverReminded: owing.filter((t) => t.remindersSent === 0).length,
    };
    const recentReminders = (
      await db
        .select({
          log: chitReminderLogTable,
          planName: chitPlansTable.name,
          fname: usersTable.fname,
          lname: usersTable.lname,
          phone: usersTable.phone,
        })
        .from(chitReminderLogTable)
        .innerJoin(chitPlansTable, eq(chitReminderLogTable.chitPlanId, chitPlansTable.id))
        .innerJoin(usersTable, eq(chitPlansTable.userId, usersTable.userId))
        .orderBy(desc(chitReminderLogTable.updatedAt))
        .limit(30)
    ).map((r) => ({
      id: r.log.id,
      kind: r.log.kind,
      periodKey: r.log.periodKey,
      status: r.log.status,
      attempts: r.log.attempts,
      lastError: r.log.lastError,
      amountDue: r.log.amountDue ? toRupees(r.log.amountDue) : null,
      sentAt: r.log.sentAt,
      updatedAt: r.log.updatedAt,
      planName: r.planName,
      customerName: fullName(r),
      phone: r.phone,
    }));

    // ── Every notification (WhatsApp + SMS) ─────────────────────────────────
    const n = notificationLogTable;
    const byKindRows = await db
      .select({
        kind: n.kind,
        channel: n.channel,
        sent24h: sql<number>`count(*) filter (where ${n.status} = 'sent' and ${n.createdAt} > now() - interval '24 hours')::int`,
        sent7d: sql<number>`count(*) filter (where ${n.status} = 'sent' and ${n.createdAt} > now() - interval '7 days')::int`,
        sent30d: sql<number>`count(*) filter (where ${n.status} = 'sent' and ${n.createdAt} > now() - interval '30 days')::int`,
        sentAll: sql<number>`count(*) filter (where ${n.status} = 'sent')::int`,
        failed30d: sql<number>`count(*) filter (where ${n.status} = 'failed' and ${n.createdAt} > now() - interval '30 days')::int`,
        failedAll: sql<number>`count(*) filter (where ${n.status} = 'failed')::int`,
      })
      .from(n)
      .groupBy(n.kind, n.channel)
      .orderBy(asc(n.kind));
    const total = (f: "sent24h" | "sent7d" | "sent30d" | "sentAll" | "failed30d" | "failedAll") =>
      byKindRows.reduce((acc, r) => acc + r[f], 0);
    const notifications = {
      sentLast24h: total("sent24h"),
      sentLast7d: total("sent7d"),
      sentLast30d: total("sent30d"),
      sentAllTime: total("sentAll"),
      failedLast30d: total("failed30d"),
      failedAllTime: total("failedAll"),
      byKind: byKindRows,
    };
    const recentNotifications = await db
      .select({
        id: n.id, kind: n.kind, channel: n.channel, status: n.status, phone: n.phone,
        error: n.error, createdAt: n.createdAt, userId: n.userId,
      })
      .from(n)
      .orderBy(desc(n.createdAt), desc(n.id))
      .limit(40);
    const recentFailures = recentNotifications.filter((x) => x.status === "failed").slice(0, 15);

    // ── Money coming in each month (chit payments) ──────────────────────────
    const monthly = await db
      .select({
        month: sql<string>`to_char(${transactionsTable.createdAt}, 'YYYY-MM')`,
        total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)::text`,
        payments: sql<number>`count(*)::int`,
      })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "debit"), sql`${transactionsTable.description} like 'Chit payment%'`))
      .groupBy(sql`to_char(${transactionsTable.createdAt}, 'YYYY-MM')`)
      .orderBy(desc(sql`to_char(${transactionsTable.createdAt}, 'YYYY-MM')`))
      .limit(12);
    const collectionsByMonth = monthly.map((m) => ({ month: m.month, total: toRupees(m.total), payments: m.payments })).reverse();

    // ── Approvals, customers, checkouts, stock, wallets ─────────────────────
    const [pendingApprovals] = await db
      .select({
        count: sql<number>`count(*)::int`,
        oldest: sql<Date | null>`min(${chitPlansTable.createdAt})`,
      })
      .from(chitPlansTable)
      .where(and(eq(chitPlansTable.isApproved, false), eq(chitPlansTable.isRejected, false), eq(chitPlansTable.status, "active")));
    const [customers] = await db
      .select({
        total: sql<number>`count(*) filter (where ${usersTable.isDeleted} = false)::int`,
        newLast30d: sql<number>`count(*) filter (where ${usersTable.isDeleted} = false and ${usersTable.registeredAt} > now() - interval '30 days')::int`,
        resellers: sql<number>`count(*) filter (where ${usersTable.isDeleted} = false and ${usersTable.isReseller})::int`,
        closed: sql<number>`count(*) filter (where ${usersTable.isDeleted})::int`,
      })
      .from(usersTable);
    const [checkouts] = await db
      .select({
        waiting: sql<number>`count(*)::int`,
        heldUnits: sql<number>`coalesce((select sum(reserved_stock) from products), 0)::int`,
      })
      .from(ordersTable)
      .where(and(eq(ordersTable.status, "pending"), eq(ordersTable.paymentStatus, "pending")));
    const lowStock = await db
      .select({
        id: productsTable.id, name: productsTable.name, stock: productsTable.stock, reserved: productsTable.reservedStock,
      })
      .from(productsTable)
      .where(and(eq(productsTable.isListed, true), sql`${productsTable.stock} - ${productsTable.reservedStock} < 5`))
      .orderBy(asc(sql`${productsTable.stock} - ${productsTable.reservedStock}`))
      .limit(10);
    const [walletTotals] = await db
      .select({
        balance: sql<string>`coalesce(sum(${walletsTable.balance}), 0)::text`,
        locked: sql<string>`coalesce(sum(${walletsTable.chitLockedBalance}), 0)::text`,
      })
      .from(walletsTable);

    return res.json({
      generatedAt: now,
      today: p,
      cycle: getCycleStatus(now),
      payments,
      pendingPayments,
      latePayments,
      multiMonthPending,
      reminders,
      recentReminders,
      notifications,
      recentNotifications,
      recentFailures,
      collectionsByMonth,
      approvals: { pending: pendingApprovals?.count ?? 0, oldestPendingAt: pendingApprovals?.oldest ?? null },
      customers,
      checkouts: { waitingForPayment: checkouts?.waiting ?? 0, unitsHeld: checkouts?.heldUnits ?? 0 },
      lowStock: lowStock.map((x) => ({ ...x, available: Math.max(x.stock - x.reserved, 0) })),
      wallets: { spendable: toRupees(walletTotals?.balance ?? "0"), lockedInChits: toRupees(walletTotals?.locked ?? "0") },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
