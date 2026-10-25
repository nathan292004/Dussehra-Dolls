import { Router } from "express";
import { and, desc, eq, count } from "drizzle-orm";
import { db } from "@workspace/db";
import { customerAddressesTable } from "@workspace/db/schema";
import { authMiddleware } from "../middlewares/auth";
import { HttpError } from "../lib/http-error";
import { buildFormattedAddress, mapsLink, syncUserAddress } from "../lib/address";
import { normalizePhone } from "../lib/phone";
import { z, parse, idParam, text, optionalText } from "../lib/validate";

const router = Router();
router.use(authMiddleware);

const MAX_ADDRESSES = 10;

const addressBody = z.object({
  label: text("Label", 1, 40).optional().default("Home"),
  recipientName: text("Receiver name", 2, 100),
  phone: z
    .string({ required_error: "Phone number is required" })
    .transform((v, ctx) => {
      const phone = normalizePhone(v);
      if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number for delivery" });
      return phone ?? z.NEVER;
    }),
  // Where exactly: what a courier needs to find the door.
  flatNumber: text("Flat / house number", 1, 60),
  building: optionalText("Building / apartment name", 100).optional().default(null),
  street: optionalText("Street / road", 120).optional().default(null),
  locality: text("Locality / area", 2, 100),
  landmark: optionalText("Landmark", 100).optional().default(null),
  city: text("City", 2, 80),
  state: text("State", 2, 80),
  pincode: z
    .string({ required_error: "Pincode is required" })
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/, "Enter a valid pincode"),
  // The pin chosen on Google Maps.
  latitude: z.number({ required_error: "Choose the location on the map", invalid_type_error: "Choose the location on the map" })
    .min(-90, "Map location is invalid").max(90, "Map location is invalid"),
  longitude: z.number({ required_error: "Choose the location on the map", invalid_type_error: "Choose the location on the map" })
    .min(-180, "Map location is invalid").max(180, "Map location is invalid"),
  isDefault: z.boolean().optional(),
}).superRefine((a, ctx) => {
  // Indian addresses have a 6-digit pincode.
  if (typeof a.phone === "string" && a.phone.startsWith("+91") &&!/^\d{6}$/.test(a.pincode)) {
    ctx.addIssue({ code: "custom", path: ["pincode"], message: "Pincode must be 6 digits" });
  }
});

function rowValues(a: z.infer<typeof addressBody>) {
  return {
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    flatNumber: a.flatNumber,
    building: a.building,
    street: a.street,
    locality: a.locality,
    landmark: a.landmark,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    latitude: a.latitude,
    longitude: a.longitude,
    formattedAddress: buildFormattedAddress(a),
    addressLink: mapsLink(a.latitude, a.longitude),
    updatedAt: new Date(),
  };
}

router.get("/", async (req, res) => {
  const rows = await db.select().from(customerAddressesTable)
    .where(eq(customerAddressesTable.userId, req.userId!))
    .orderBy(desc(customerAddressesTable.isDefault), desc(customerAddressesTable.updatedAt))
    .limit(MAX_ADDRESSES);
  res.json({ addresses: rows });
});

router.post("/", async (req, res) => {
  const a = parse(addressBody, req.body);
  const userId = req.userId!;
  const saved = await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(customerAddressesTable).where(eq(customerAddressesTable.userId, userId));
    if (Number(n) >= MAX_ADDRESSES) {
      throw new HttpError(409, `You can save up to ${MAX_ADDRESSES} addresses. Please remove one first.`, "TOO_MANY_ADDRESSES");
    }
    const makeDefault = Boolean(a.isDefault) || Number(n) === 0;
    if (makeDefault) {
      await tx.update(customerAddressesTable).set({ isDefault: false, updatedAt: new Date() })
        .where(eq(customerAddressesTable.userId, userId));
    }
    const [row] = await tx.insert(customerAddressesTable).values({ userId, ...rowValues(a), isDefault: makeDefault }).returning();
    await syncUserAddress(tx, userId);
    return row;
  });
  res.status(201).json({ address: saved });
});

router.put("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const a = parse(addressBody, req.body);
  const userId = req.userId!;
  const saved = await db.transaction(async (tx) => {
    if (a.isDefault) {
      await tx.update(customerAddressesTable).set({ isDefault: false, updatedAt: new Date() })
        .where(eq(customerAddressesTable.userId, userId));
    }
    const [row] = await tx.update(customerAddressesTable)
      .set({ ...rowValues(a), ...(a.isDefault ? { isDefault: true } : {}) })
      .where(and(eq(customerAddressesTable.id, id), eq(customerAddressesTable.userId, userId)))
      .returning();
    if (!row) throw new HttpError(404, "Address not found");
    await syncUserAddress(tx, userId);
    return row;
  });
  res.json({ address: saved });
});

router.put("/:id/default", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const userId = req.userId!;
  const result = await db.transaction(async (tx) => {
    const [target] = await tx.select().from(customerAddressesTable)
      .where(and(eq(customerAddressesTable.id, id), eq(customerAddressesTable.userId, userId))).limit(1);
    if (!target) return null;
    await tx.update(customerAddressesTable).set({ isDefault: false, updatedAt: new Date() })
      .where(eq(customerAddressesTable.userId, userId));
    const [row] = await tx.update(customerAddressesTable).set({ isDefault: true, updatedAt: new Date() })
      .where(eq(customerAddressesTable.id, id)).returning();
    await syncUserAddress(tx, userId);
    return row;
  });
  if (!result) throw new HttpError(404, "Address not found");
  res.json({ address: result });
});

router.delete("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const userId = req.userId!;
  await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(customerAddressesTable)
      .where(and(eq(customerAddressesTable.id, id), eq(customerAddressesTable.userId, userId)))
      .returning();
    if (!deleted) throw new HttpError(404, "Address not found");
    // If the default one was removed, the most recently used remaining address becomes the default.
    if (deleted.isDefault) {
      const [next] = await tx.select({ id: customerAddressesTable.id }).from(customerAddressesTable)
        .where(eq(customerAddressesTable.userId, userId)).orderBy(desc(customerAddressesTable.updatedAt)).limit(1);
      if (next) await tx.update(customerAddressesTable).set({ isDefault: true }).where(eq(customerAddressesTable.id, next.id));
    }
    await syncUserAddress(tx, userId);
  });
  res.sendStatus(204);
});

export default router;
