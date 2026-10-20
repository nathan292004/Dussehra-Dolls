import { Router } from "express";
import { db } from "@workspace/db";
import { chitPlansTable, usersTable } from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AdminRequest } from "../middlewares/admin-auth";
import { describeChitPlan, chitPlanDue, chitReviewStatus } from "../lib/chit-view";
import { cycleHasEnded } from "../lib/chit-rules";
import { loadTrackedChitPlans } from "../lib/chit-tracking";
import { notifyChitPlanApproved, notifyChitPlanRejected } from "../lib/whatsapp-notifications";

// Mounted at /api/admin/chit-plans (admin login required, see routes/index.ts).
const router = Router();

const customerName = (u: { fname: string; lname: string | null }) => [u.fname, u.lname].filter(Boolean).join(" ");

// ─── Review queue ────────────────────────────────────────────────────────────
// ?status=under_review (default) | approved | rejected | all
router.get("/", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "under_review";
    const rows = await db
      .select({ plan: chitPlansTable, user: usersTable })
      .from(chitPlansTable)
      .innerJoin(usersTable, eq(chitPlansTable.userId, usersTable.userId))
      .orderBy(desc(chitPlansTable.createdAt))
      .limit(500);

    const all = rows
      .filter(({ plan }) => plan.status !== "cancelled")
      .map(({ plan, user }) => {
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

    const counts = {
      under_review: all.filter((p) => p.reviewStatus === "under_review").length,
      approved: all.filter((p) => p.reviewStatus === "active" || p.reviewStatus === "completed").length,
      rejected: all.filter((p) => p.reviewStatus === "rejected").length,
      all: all.length,
    };
    const plans = all.filter((p) =>
      status === "all" ? true
      : status === "approved" ? p.reviewStatus === "active" || p.reviewStatus === "completed"
      : p.reviewStatus === status,
    );
    return res.json({ counts, plans });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Approved plans with their payment status (replaces the old "subscriptions" list) ─────
router.get("/subscriptions", async (_req, res) => {
  try {
    const plans = await loadTrackedChitPlans();
    const stats = {
      totalSubscriptions: plans.length,
      paid: plans.filter((p) => p.paymentStatus === "paid").length,
      pending: plans.filter((p) => p.paymentStatus === "pending").length,
      overdue: plans.filter((p) => p.paymentStatus === "overdue").length,
      completed: plans.filter((p) => p.paymentStatus === "completed").length,
    };
    return res.json({ stats, plans });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Approve / reject ────────────────────────────────────────────────────────
// The status change is a single conditional UPDATE, so if two admins act on the same plan at
// the same moment only one wins and the other is told it was already reviewed.
async function loadOwner(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, userId)).limit(1);
  return user;
}

router.post("/:id/approve", async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: "Chit plan not found" });

    const [plan] = await db.select().from(chitPlansTable).where(eq(chitPlansTable.id, id)).limit(1);
    if (!plan) return res.status(404).json({ error: "Chit plan not found" });
    if (plan.status === "cancelled") return res.status(409).json({ error: "This plan was cancelled by the customer." });
    if (cycleHasEnded(plan.cycleStartYear)) {
      return res.status(409).json({ error: "This plan year has ended, so the plan can no longer be approved. Reject it instead." });
    }

    const [updated] = await db
      .update(chitPlansTable)
      .set({ isApproved: true, reviewedBy: req.adminId ?? null, reviewedAt: new Date() })
      .where(and(
        eq(chitPlansTable.id, id),
        eq(chitPlansTable.isApproved, false),
        eq(chitPlansTable.isRejected, false),
        eq(chitPlansTable.status, "active"),
      ))
      .returning();
    if (!updated) {
      return res.status(409).json({ error: `This plan was already ${chitReviewStatus(plan) === "rejected" ? "rejected" : "approved"}.`, code: "ALREADY_REVIEWED" });
    }

    const user = await loadOwner(updated.userId);
    if (user) {
      notifyChitPlanApproved({
        phone: user.phone, name: customerName(user), userId: user.userId,
        chitPlanId: updated.id, planName: updated.name, amountDueNow: chitPlanDue(updated).outstanding,
      }).catch((e) => console.error("[WhatsApp] Chit approved notify failed:", e));
    }
    return res.json(describeChitPlan(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/reject", async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: "Chit plan not found" });
    const reasonRaw = req.body?.reason;
    if (reasonRaw !== undefined && reasonRaw !== null && typeof reasonRaw !== "string") {
      return res.status(400).json({ error: "Reason must be text" });
    }
    const reason = typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim() : null;
    if (reason && reason.length > 300) return res.status(400).json({ error: "Reason must be at most 300 characters" });

    const [plan] = await db.select().from(chitPlansTable).where(eq(chitPlansTable.id, id)).limit(1);
    if (!plan) return res.status(404).json({ error: "Chit plan not found" });
    if (plan.status === "cancelled") return res.status(409).json({ error: "This plan was cancelled by the customer." });

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
      return res.status(409).json({
        error: `This plan was already ${chitReviewStatus(plan) === "rejected" ? "rejected" : "approved"}.`,
        code: "ALREADY_REVIEWED",
      });
    }

    const user = await loadOwner(updated.userId);
    if (user) {
      notifyChitPlanRejected({
        phone: user.phone, name: customerName(user), userId: user.userId,
        chitPlanId: updated.id, planName: updated.name, reason: updated.rejectionReason,
      }).catch((e) => console.error("[WhatsApp] Chit rejected notify failed:", e));
    }
    return res.json(describeChitPlan(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
