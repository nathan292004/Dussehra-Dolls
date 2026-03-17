import { Router } from "express";
import { db } from "@workspace/db";
import { chitPlansTable, chitEnrollmentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const plans = await db.select().from(chitPlansTable);
    return res.json(plans.map(p => ({
      ...p,
      totalAmount: parseFloat(p.totalAmount),
      monthlyContribution: parseFloat(p.monthlyContribution),
      members: p.currentMembers,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/my", authMiddleware as any, async (req: AuthRequest, res) => {
  try {
    const enrollments = await db
      .select({ enrollment: chitEnrollmentsTable, plan: chitPlansTable })
      .from(chitEnrollmentsTable)
      .leftJoin(chitPlansTable, eq(chitEnrollmentsTable.chitPlanId, chitPlansTable.id))
      .where(eq(chitEnrollmentsTable.userId, req.userId!));

    return res.json(enrollments.filter(e => e.plan).map(e => ({
      id: e.enrollment.id,
      chitPlan: {
        ...e.plan!,
        totalAmount: parseFloat(e.plan!.totalAmount),
        monthlyContribution: parseFloat(e.plan!.monthlyContribution),
        members: e.plan!.currentMembers,
      },
      joinedAt: e.enrollment.joinedAt,
      amountPaid: parseFloat(e.enrollment.amountPaid),
      nextPaymentDate: e.enrollment.nextPaymentDate,
      status: e.enrollment.status,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", authMiddleware as any, async (req: AuthRequest, res) => {
  try {
    const { chitPlanId } = req.body;
    const [plan] = await db.select().from(chitPlansTable).where(eq(chitPlansTable.id, chitPlanId)).limit(1);
    if (!plan) return res.status(404).json({ error: "Chit plan not found" });
    if (plan.status !== "open") return res.status(400).json({ error: "Chit plan is not open" });
    if (plan.currentMembers >= plan.maxMembers) return res.status(400).json({ error: "Chit plan is full" });

    const existing = await db.select().from(chitEnrollmentsTable)
      .where(and(eq(chitEnrollmentsTable.userId, req.userId!), eq(chitEnrollmentsTable.chitPlanId, chitPlanId)))
      .limit(1);
    if (existing.length > 0) return res.status(409).json({ error: "Already enrolled" });

    const nextPayment = new Date();
    nextPayment.setMonth(nextPayment.getMonth() + 1);

    const [enrollment] = await db.insert(chitEnrollmentsTable).values({
      userId: req.userId!,
      chitPlanId,
      nextPaymentDate: nextPayment,
    }).returning();

    await db.update(chitPlansTable)
      .set({ currentMembers: plan.currentMembers + 1 })
      .where(eq(chitPlansTable.id, chitPlanId));

    return res.status(201).json({
      id: enrollment.id,
      chitPlan: { ...plan, totalAmount: parseFloat(plan.totalAmount), monthlyContribution: parseFloat(plan.monthlyContribution), members: plan.currentMembers + 1 },
      joinedAt: enrollment.joinedAt,
      amountPaid: parseFloat(enrollment.amountPaid),
      nextPaymentDate: enrollment.nextPaymentDate,
      status: enrollment.status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Enroll with a custom amount and duration — creates a personal chit plan on the fly
router.post("/enroll-custom", authMiddleware as any, async (req: AuthRequest, res) => {
  try {
    const { amount, durationMonths } = req.body;
    if (!amount || !durationMonths) {
      return res.status(400).json({ error: "Amount and durationMonths are required" });
    }
    const amt = parseFloat(amount);
    const dur = parseInt(durationMonths);
    if (isNaN(amt) || amt < 1000) return res.status(400).json({ error: "Minimum amount is ₹1,000" });
    if (isNaN(dur) || dur < 1 || dur > 24) return res.status(400).json({ error: "Duration must be 1-24 months" });

    const monthlyContribution = amt / dur;
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + dur);

    const [plan] = await db.insert(chitPlansTable).values({
      name: `Custom ₹${amt.toLocaleString("en-IN")} – ${dur} months`,
      description: `Personal chit plan`,
      totalAmount: amt.toFixed(2),
      monthlyContribution: monthlyContribution.toFixed(2),
      duration: dur,
      maxMembers: 1,
      currentMembers: 0,
      status: "open",
    }).returning();

    const nextPayment = new Date();
    nextPayment.setMonth(nextPayment.getMonth() + 1);

    const [enrollment] = await db.insert(chitEnrollmentsTable).values({
      userId: req.userId!,
      chitPlanId: plan.id,
      nextPaymentDate: nextPayment,
    }).returning();

    await db.update(chitPlansTable)
      .set({ currentMembers: 1 })
      .where(eq(chitPlansTable.id, plan.id));

    return res.status(201).json({
      id: enrollment.id,
      chitPlan: { ...plan, totalAmount: parseFloat(plan.totalAmount), monthlyContribution: parseFloat(plan.monthlyContribution), members: 1 },
      joinedAt: enrollment.joinedAt,
      amountPaid: 0,
      nextPaymentDate: enrollment.nextPaymentDate,
      status: enrollment.status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
