import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { customerAddressesTable } from "@workspace/db/schema";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware as any);

router.get("/", async (req: AuthRequest, res) => {
  const rows = await db.select().from(customerAddressesTable)
    .where(eq(customerAddressesTable.userId, req.userId!))
    .orderBy(desc(customerAddressesTable.isDefault), desc(customerAddressesTable.updatedAt));
  return res.json({ addresses: rows });
});

router.post("/", async (req: AuthRequest, res) => {
  const { label, recipientName, phone, formattedAddress, latitude, longitude, isDefault } = req.body || {};
  if (typeof recipientName !== "string" || recipientName.trim().length < 2 || recipientName.length > 100 ||
      typeof phone !== "string" || phone.replace(/\D/g, "").length < 10 || phone.length > 20 ||
      typeof formattedAddress !== "string" || formattedAddress.trim().length < 8 || formattedAddress.length > 500 ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      (label !== undefined && (typeof label !== "string" || label.trim().length < 1 || label.length > 40)) ||
      (isDefault !== undefined && typeof isDefault !== "boolean")) {
    return res.status(400).json({ error: "Enter a name, valid phone, complete address and selected map pin" });
  }
  const saved = await db.transaction(async tx => {
    const existing = await tx.select({ id: customerAddressesTable.id }).from(customerAddressesTable)
      .where(eq(customerAddressesTable.userId, req.userId!)).limit(1);
    const makeDefault = Boolean(isDefault) || existing.length === 0;
    if (makeDefault) await tx.update(customerAddressesTable).set({ isDefault: false, updatedAt: new Date() })
      .where(eq(customerAddressesTable.userId, req.userId!));
    const [row] = await tx.insert(customerAddressesTable).values({ userId: req.userId!,
      label: typeof label === "string" ? label.trim() : "Home", recipientName: recipientName.trim(),
      phone: phone.trim(), formattedAddress: formattedAddress.trim(), latitude, longitude,
      isDefault: makeDefault, updatedAt: new Date() }).returning();
    return row;
  });
  return res.status(201).json({ address: saved });
});

router.put("/:id/default", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid address" });
  const result = await db.transaction(async tx => {
    const [target] = await tx.select().from(customerAddressesTable).where(and(
      eq(customerAddressesTable.id, id), eq(customerAddressesTable.userId, req.userId!))).limit(1);
    if (!target) return null;
    await tx.update(customerAddressesTable).set({ isDefault: false, updatedAt: new Date() })
      .where(eq(customerAddressesTable.userId, req.userId!));
    const [row] = await tx.update(customerAddressesTable).set({ isDefault: true, updatedAt: new Date() })
      .where(eq(customerAddressesTable.id, id)).returning();
    return row;
  });
  if (!result) return res.status(404).json({ error: "Address not found" });
  return res.json({ address: result });
});

router.delete("/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid address" });
  const [deleted] = await db.delete(customerAddressesTable).where(and(
    eq(customerAddressesTable.id, id), eq(customerAddressesTable.userId, req.userId!))).returning({ id: customerAddressesTable.id });
  if (!deleted) return res.status(404).json({ error: "Address not found" });
  return res.sendStatus(204);
});

export default router;
