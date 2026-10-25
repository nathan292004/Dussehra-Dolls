import { Router } from "express";
import { db } from "@workspace/db";
import { chitPlansTable, usersTable, walletsTable } from "@workspace/db/schema";
import { and, count, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { HttpError } from "../lib/http-error";
import { likePattern, readPage, readSearch } from "../lib/pagination";
import { z, parse, idParam, optionalText } from "../lib/validate";
import { describeChitPlan, chitPlanDue, chitReviewStatus } from "../lib/chit-view";
import { cycleHasEnded } from "../lib/chit-rules";
import { loadTrackedChitPlans } from "../lib/chit-tracking";
import { notifyChitPlanApproved, notifyChitPlanRejected } from "../lib/whatsapp-notifications";

// Mounted at /api/admin/chit-plans (admin login required, see routes/index.ts).
const router = Router();

const customerName = (u: { fname: string; lname: string | null }) => [u.fname, u.lname].filter(Boolean).join(" ");

// ─── Review queue (paginated) ────────────────────────────────────────────────
// ?status=under_review (default) | approved | rejected | all &page=1&pageSize=25 &q=name, phone or user id
const reviewQuery = z.object({
  status: z.enum(["under_review", "approved", "rejected", "all"]).default("under_review"),
});

const notCancelled = ne(chitPlansTable.status, "cancelled");
const STATUS_FILTER = {
  under_review: and(notCancelled, eq(chitPlansTable.isApproved, false), eq(chitPlansTable.isRejected, false)),
  approved: and(notCancelled, eq(chitPlansTable.isApproved, true)),
  rejected: and(notCancelled, eq(chitPlansTable.isRejected, true)),
  all: notCancelled,
};

router.get("/", async (req, res) => {
  const { status } = parse(reviewQuery, req.query);
  const p = readPage(req);
  const q = readSearch(req);
  const like = likePattern(q);
  const search = q
    ? sql`(concat_ws(' ', ${usersTable.fname}, ${usersTable.lname}) ilike ${like} or ${usersTable.phone} ilike ${like} or ${usersTable.userId} ilike ${like})`
    : undefined;

  const countFor = async (filter: SQL | undefined) => {
    const [row] = await db
      .select({ n: count() })
      .from(chitPlansTable)
      .innerJoin(usersTable, eq(chitPlansTable.userId, usersTable.userId))
      .where(and(filter, search));
    return Number(row.n);
  };
  const counts = {
    under_review: await countFor(STATUS_FILTER.under_review),
    approved: await countFor(STATUS_FILTER.approved),
    rejected: await countFor(STATUS_FILTER.rejected),
    all: await countFor(STATUS_FILTER.all),
  };

  const rows = await db
    .select({ plan: chitPlansTable, user: usersTable })
    .from(chitPlansTable)
    .innerJoin(usersTable, eq(chitPlansTable.userId, usersTable.userId))
    .where(and(STATUS_FILTER[status], search))
    .orderBy(desc(chitPlansTable.createdAt), desc(chitPlansTable.id))
    .limit(p.pageSize)
    .offset(p.offset);

  const plans = rows.map(({ plan, user }) => {
    const view = describeChitPlan(plan);
    return {
      ...view,
      // What the customer will have to pay straight away once approved (October up to this month).
      amountDueOnApproval: view.reviewStatus === "under_review" ? chitPlanDue(plan).outstanding : null,
      cycleEnded: cycleHasEnded(plan.cycleStartYear),
      customer: {
        userId: user.userId,
        index: user.index,
        name: customerName(user),
        phone: user.phone,
        registeredAt: user.registeredAt,
        isReseller: user.isReseller,
      },
    };
  });
  const total = counts[status];
  res.json({ counts, plans, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) });
});

// ─── Approved plans with their payment status ────────────────────────────────
// ?status=paid|pending|overdue|completed &q=... &page=1&pageSize=25. Statuses are worked out from the
// calendar, so the filter and page are applied after calculating them. Totals (stats) cover every plan.
const subscriptionQuery = z.object({ status: z.enum(["paid", "pending", "overdue", "completed"]).optional() });

router.get("/subscriptions", async (req, res) => {
  const { status } = parse(subscriptionQuery, req.query);
  const p = readPage(req);
  const q = readSearch(req).toLowerCase();
  const all = await loadTrackedChitPlans();
  const stats = {
    totalSubscriptions: all.length,
    paid: all.filter((x) => x.paymentStatus === "paid").length,
    pending: all.filter((x) => x.paymentStatus === "pending").length,
    overdue: all.filter((x) => x.paymentStatus === "overdue").length,
    completed: all.filter((x) => x.paymentStatus === "completed").length,
  };
  const matching = all.filter(
    (x) =>
      (!status || x.paymentStatus === status) &&
      (!q || [x.customer.name, x.customer.phone, x.customer.userId].some((v) => v.toLowerCase().includes(q))),
  );
  res.json({
    stats,
    plans: matching.slice(p.offset, p.offset + p.pageSize),
    total: matching.length,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(matching.length / p.pageSize)),
  });
});

// ─── Approve / reject ────────────────────────────────────────────────────────
// The status change is a single conditional UPDATE, so if two admins act on the same plan at
// the same moment only one wins and the other is told it was already reviewed.
async function loadOwner(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, userId)).limit(1);
  return user;
}

router.post("/:id/approve", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const [plan] = await db.select().from(chitPlansTable).where(eq(chitPlansTable.id, id)).limit(1);
  if (!plan) throw new HttpError(404, "Chit plan not found");
  if (plan.status === "cancelled") throw new HttpError(409, "This plan was cancelled by the customer.");
  if (cycleHasEnded(plan.cycleStartYear)) {
    throw new HttpError(409, "This plan year has ended, so the plan can no longer be approved. Reject it instead.");
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(chitPlansTable)
      .set({ isApproved: true, reviewedBy: req.adminId ?? null, reviewedAt: new Date() })
      .where(and(
        eq(chitPlansTable.id, id),
        eq(chitPlansTable.isApproved, false),
        eq(chitPlansTable.isRejected, false),
        eq(chitPlansTable.status, "active"),
      ))
      .returning();
    if (!row) return null;
    // From now on the customer's wallet stays closed until the last chit payment is made.
    await tx
      .insert(walletsTable)
      .values({ userId: row.userId, isReleased: false })
      .onConflictDoUpdate({
        target: walletsTable.userId,
        set: { isReleased: false, releasedAt: null, updatedAt: new Date() },
      });
    return row;
  });
  if (!updated) {
    throw new HttpError(409, `This plan was already ${chitReviewStatus(plan) === "rejected" ? "rejected" : "approved"}.`, "ALREADY_REVIEWED");
  }

  const user = await loadOwner(updated.userId);
  if (user) {
    notifyChitPlanApproved({
      phone: user.phone, name: customerName(user), userId: user.userId,
      chitPlanId: updated.id, planName: updated.name, amountDueNow: chitPlanDue(updated).outstanding,
    }).catch((e) => console.error("[WhatsApp] Chit approved notify failed:", e));
  }
  res.json(describeChitPlan(updated));
});

const rejectBody = z.object({ reason: optionalText("Reason", 300).optional() });

router.post("/:id/reject", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const reason = parse(rejectBody, req.body).reason ?? null;

  const [plan] = await db.select().from(chitPlansTable).where(eq(chitPlansTable.id, id)).limit(1);
  if (!plan) throw new HttpError(404, "Chit plan not found");
  if (plan.status === "cancelled") throw new HttpError(409, "This plan was cancelled by the customer.");

  const [updated] = await db
    .update(chitPlansTable)
    .set({ isRejected: true, rejectionReason: reason, reviewedBy: req.adminId ?? null, reviewedAt: new Date() })
    .where(and(
      eq(chitPlansTable.id, id),
      eq(chitPlansTable.isApproved, false),
      eq(chitPlansTable.isRejected, false),
      eq(chitPlansTable.status, "active"),
    ))
    .returning();
  if (!updated) {
    throw new HttpError(409, `This plan was already ${chitReviewStatus(plan) === "rejected" ? "rejected" : "approved"}.`, "ALREADY_REVIEWED");
  }

  const user = await loadOwner(updated.userId);
  if (user) {
    notifyChitPlanRejected({
      phone: user.phone, name: customerName(user), userId: user.userId,
      chitPlanId: updated.id, planName: updated.name, reason: updated.rejectionReason,
    }).catch((e) => console.error("[WhatsApp] Chit rejected notify failed:", e));
  }
  res.json(describeChitPlan(updated));
});

export default router;
