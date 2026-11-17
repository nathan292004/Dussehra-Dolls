import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, ordersTable, walletsTable, transactionsTable, resellerCommissionsTable } from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import { fromPaise, paiseToDecimal, toPaise, toRupees } from "../lib/money";

const router = Router();

function generateResellerCode(userIndex: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return `DD${userIndex}${suffix}`;
}

// ─── Public: Validate a reseller referral code ─────────────────────────────
router.get("/validate/:code", async (req, res, next) => {
  try {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ valid: false, error: "Referral code is required" });
    }

    const [user] = await db
      .select({
        userId: usersTable.userId,
        fname: usersTable.fname,
        lname: usersTable.lname,
        isReseller: usersTable.isReseller,
        resellerCode: usersTable.resellerCode,
        isActive: usersTable.isActive,
        isDeleted: usersTable.isDeleted,
      })
      .from(usersTable)
      .where(and(eq(usersTable.resellerCode, code), eq(usersTable.isDeleted, false)))
      .limit(1);

    if (!user || !user.isReseller || !user.isActive) {
      return res.status(404).json({ valid: false, error: "Invalid or inactive referral code" });
    }

    const resellerName = [user.fname, user.lname].filter(Boolean).join(" ") || "DollDime Partner";
    return res.json({
      valid: true,
      resellerCode: user.resellerCode,
      resellerName,
      discountPercent: 5,
    });
  } catch (err) {
    next(err);
    return;
  }
});

// ─── Customer: Register / Upgrade as a Reseller ────────────────────────────
router.post("/register", authMiddleware as any, async (req: AuthRequest, res, next) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, req.userId!)).limit(1);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (user.isReseller && user.resellerCode) {
      return res.json({
        success: true,
        message: "You are already registered as a partner reseller.",
        resellerCode: user.resellerCode,
        isReseller: true,
      });
    }

    const requestedCode = typeof req.body?.customCode === "string" ? req.body.customCode.trim().toUpperCase() : "";
    let finalCode = requestedCode || generateResellerCode(user.index);

    // If requested code is provided, check if it's already taken
    if (requestedCode) {
      const [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.resellerCode, requestedCode))
        .limit(1);
      if (existing && existing.userId !== user.userId) {
        return res.status(409).json({ error: "This referral code is already taken. Please choose another." });
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({
        isReseller: true,
        resellerCode: finalCode,
      })
      .where(eq(usersTable.userId, user.userId))
      .returning();

    return res.json({
      success: true,
      message: "Congratulations! Your partner reseller account is now active.",
      resellerCode: updated.resellerCode,
      isReseller: true,
    });
  } catch (err) {
    next(err);
    return;
  }
});

// ─── Reseller: Dashboard and Sales Performance ─────────────────────────────
router.get("/dashboard", authMiddleware as any, async (req: AuthRequest, res, next) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, req.userId!)).limit(1);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (!user.isReseller || !user.resellerCode) {
      return res.status(403).json({
        error: "You are not registered as a reseller. Please register to access the reseller dashboard.",
        isReseller: false,
      });
    }

    // Query commissions earned
    const commissions = await db
      .select()
      .from(resellerCommissionsTable)
      .where(eq(resellerCommissionsTable.resellerId, user.userId))
      .orderBy(desc(resellerCommissionsTable.createdAt))
      .limit(50);

    const [{ totalCommissions, totalSales, totalOrders }] = await db
      .select({
        totalCommissions: sql<string>`coalesce(sum(${resellerCommissionsTable.commissionAmount}), 0)::text`,
        totalSales: sql<string>`coalesce(sum(${resellerCommissionsTable.orderTotal}), 0)::text`,
        totalOrders: sql<number>`count(*)::int`,
      })
      .from(resellerCommissionsTable)
      .where(eq(resellerCommissionsTable.resellerId, user.userId));

    return res.json({
      isReseller: true,
      resellerCode: user.resellerCode,
      shareLink: `https://dolldime.com?ref=${user.resellerCode}`,
      stats: {
        totalOrders,
        totalSales: toRupees(totalSales),
        totalCommissions: toRupees(totalCommissions),
        commissionRate: "5.0%",
      },
      recentCommissions: commissions.map((c) => ({
        id: c.id,
        orderId: c.orderId,
        orderTotal: toRupees(c.orderTotal),
        commissionAmount: toRupees(c.commissionAmount),
        status: c.status,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    next(err);
    return;
  }
});

/**
 * Helper to record and credit a commission when an order with a resellerCode is paid.
 */
export async function recordResellerCommission(orderId: number, orderTotalRupees: number, resellerCode: string) {
  if (!resellerCode) return null;
  try {
    const cleanCode = resellerCode.trim().toUpperCase();
    const [reseller] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.resellerCode, cleanCode), eq(usersTable.isReseller, true), eq(usersTable.isDeleted, false)))
      .limit(1);

    if (!reseller) return null;

    const commissionPercent = 5; // 5% standard commission
    const commissionRupees = (orderTotalRupees * commissionPercent) / 100;
    const commissionPaise = Math.round(commissionRupees * 100);

    if (commissionPaise <= 0) return null;

    return await db.transaction(async (tx) => {
      // Record commission entry
      const [commission] = await tx
        .insert(resellerCommissionsTable)
        .values({
          resellerId: reseller.userId,
          orderId,
          orderTotal: paiseToDecimal(Math.round(orderTotalRupees * 100)),
          commissionRate: `${commissionPercent}.00`,
          commissionAmount: paiseToDecimal(commissionPaise),
          status: "credited",
        })
        .returning();

      // Automatically credit commission to the reseller's wallet balance
      await tx
        .update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} + ${paiseToDecimal(commissionPaise)}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(walletsTable.userId, reseller.userId));

      await tx.insert(transactionsTable).values({
        userId: reseller.userId,
        type: "credit",
        amount: paiseToDecimal(commissionPaise),
        description: `Reseller commission (5%) – Order #${orderId} (${cleanCode})`,
      });

      return commission;
    });
  } catch (err) {
    console.error("[Reseller] Failed to record commission:", err);
    return null;
  }
}

export default router;
