import { Router } from "express";
import { db } from "@workspace/db";
import { chitPlansTable, usersTable, transactionsTable } from "@workspace/db/schema";
import { and, desc, eq, ne, ilike } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import {
  CHIT_VALUE,
  CHIT_DURATION_MONTHS,
  MIN_CHITS,
  MAX_CHITS,
  isValidChitCount,
  chitPlanFigures,
  getCycleStatus,
  istParts,
} from "../lib/chit-rules";
import { describeChitPlan } from "../lib/chit-view";
import { paiseToDecimal } from "../lib/money";
import { uniqueViolationConstraint } from "../lib/lockout";
import { notifyChitPlanSubmitted } from "../lib/whatsapp-notifications";
import { cancelChitPlan } from "../lib/chit-cancellation";
import { generateChitStatementPdf } from "../lib/document-generator";

const router = Router();

// What the customer needs to know before joining: the standard rules and where we are in the cycle.
router.get("/cycle", (_req, res) => {
  const cycle = getCycleStatus();
  return res.json({
    ...cycle,
    chitValue: CHIT_VALUE,
    durationMonths: CHIT_DURATION_MONTHS,
    minChits: MIN_CHITS,
    maxChits: MAX_CHITS,
    today: istParts(),
  });
});

// The customer's own plans, newest first: under review, rejected, active and completed.
router.get("/my", authMiddleware as any, async (req: AuthRequest, res, next) => {
  try {
    const plans = await db
      .select()
      .from(chitPlansTable)
      .where(and(eq(chitPlansTable.userId, req.userId!), ne(chitPlansTable.status, "cancelled")))
      .orderBy(desc(chitPlansTable.createdAt), desc(chitPlansTable.id));
    return res.json(plans.map((p) => describeChitPlan(p)));
  } catch (err) {
    next(err);
    return;
  }
});

// Submit a plan for review. It cannot be paid for until an admin approves it.
// One plan per customer per plan year (under review or approved): the database enforces this,
// so if two requests arrive together one is created and the other is told to retry.
router.post("/enroll-custom", authMiddleware as any, async (req: AuthRequest, res, next) => {
  try {
    const { chits } = req.body ?? {};
    if (!isValidChitCount(chits)) {
      return res.status(400).json({ error: `Number of chits must be a whole number from ${MIN_CHITS} to ${MAX_CHITS}` });
    }

    const cycle = getCycleStatus();
    if (!cycle.open) {
      return res.status(400).json({
        error: `Chit plans are closed for now. The next cycle starts in October ${cycle.nextCycleStartYear}.`,
      });
    }

    const figures = chitPlanFigures(chits);
    let plan;
    try {
      [plan] = await db.insert(chitPlansTable).values({
        userId: req.userId!,
        name: `${chits} Chit${chits === 1 ? "" : "s"} – ₹${figures.monthly.toLocaleString("en-IN")}/month`,
        chits,
        monthlyAmount: paiseToDecimal(figures.monthly * 100),
        totalAmount: paiseToDecimal(figures.total * 100),
        bonusPoints: figures.bonusPoints,
        durationMonths: CHIT_DURATION_MONTHS,
        cycleStartYear: cycle.startYear,
      }).returning();
    } catch (err) {
      if (uniqueViolationConstraint(err) === "chit_plans_one_per_user_per_year") {
        return res.status(409).json({
          error: "You already have a chit plan for this year (under review or approved). Please check My Chits. If you just submitted one, wait a moment and refresh.",
          code: "CHIT_PLAN_EXISTS",
        });
      }
      throw err;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, req.userId!)).limit(1);
    if (user?.phone) {
      notifyChitPlanSubmitted({
        phone: user.phone,
        name: [user.fname, user.lname].filter(Boolean).join(" ") || "Customer",
        userId: user.userId,
        chitPlanId: plan.id,
        planName: plan.name,
      }).catch((e) => console.error("[WhatsApp] Chit submitted notify failed:", e));
    }

    return res.status(201).json(describeChitPlan(plan));
  } catch (err) {
    next(err);
    return;
  }
});

// Customer cancellation of a chit plan
router.post("/:id/cancel", authMiddleware as any, async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid chit plan ID" });
    }
    const { reason } = req.body ?? {};
    const result = await cancelChitPlan({
      chitPlanId: id,
      userId: req.userId!,
      reason: typeof reason === "string" ? reason.trim() : undefined,
      cancelledBy: "customer",
    });

    if (!result.success) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({
      success: true,
      message:
        result.refundedAmount > 0
          ? `Chit plan cancelled successfully. ₹${result.refundedAmount.toLocaleString("en-IN")} has been refunded to your wallet.`
          : "Chit plan cancelled successfully.",
      refundedAmount: result.refundedAmount,
      plan: result.plan,
    });
  } catch (err) {
    next(err);
    return;
  }
});

// Download official chit statement / membership receipt PDF
router.get("/:id/statement", authMiddleware as any, async (req: AuthRequest, res, next) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(404).json({ error: "Chit plan not found" });

    const [plan] = await db
      .select()
      .from(chitPlansTable)
      .where(and(eq(chitPlansTable.id, id), eq(chitPlansTable.userId, req.userId!)))
      .limit(1);
    if (!plan) return res.status(404).json({ error: "Chit plan not found" });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, req.userId!)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    const transactions = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.userId, req.userId!), ilike(transactionsTable.description, `%${plan.name}%`)))
      .orderBy(desc(transactionsTable.createdAt));

    const described = describeChitPlan(plan);
    const pdfBuffer = await generateChitStatementPdf(
      described,
      {
        userId: user.userId,
        fname: user.fname,
        lname: user.lname,
        phone: user.phone,
      },
      transactions,
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="chit-statement-${plan.id}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (err) {
    next(err);
    return;
  }
});

export default router;
