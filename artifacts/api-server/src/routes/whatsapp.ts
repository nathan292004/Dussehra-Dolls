import { Router } from "express";
import { db } from "@workspace/db";
import { whatsappPreferencesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.use(authMiddleware);
router.get("/preferences", async (req, res) => {
  const [row] = await db.select().from(whatsappPreferencesTable).where(eq(whatsappPreferencesTable.userId, req.userId!)).limit(1);
  return res.json({ orderUpdates: row?.orderUpdates ?? false, marketing: row?.marketing ?? false });
});
router.put("/preferences", async (req, res) => {
  const { orderUpdates, marketing } = req.body || {};
  if (typeof orderUpdates !== "boolean" || typeof marketing !== "boolean") return res.status(400).json({ error: "Both choices are required" });
  const [existing] = await db.select().from(whatsappPreferencesTable).where(eq(whatsappPreferencesTable.userId, req.userId!)).limit(1);
  const orderUpdatesOptedAt = orderUpdates && !existing?.orderUpdates ? new Date() : existing?.orderUpdatesOptedAt ?? null;
  const marketingOptedAt = marketing && !existing?.marketing ? new Date() : existing?.marketingOptedAt ?? null;
  const [row] = await db.insert(whatsappPreferencesTable).values({ userId: req.userId!, orderUpdates, marketing,
    orderUpdatesOptedAt, marketingOptedAt }).onConflictDoUpdate({ target: whatsappPreferencesTable.userId,
    set: { orderUpdates, marketing, orderUpdatesOptedAt, marketingOptedAt, updatedAt: new Date() } }).returning();
  return res.json({ orderUpdates: row.orderUpdates, marketing: row.marketing });
});

export default router;
