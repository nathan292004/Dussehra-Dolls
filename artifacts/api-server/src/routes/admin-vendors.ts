import { Router } from "express";
import { count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { HttpError } from "../lib/http-error";
import { likePattern, pageOf, readPage, readSearch } from "../lib/pagination";
import { z, parse, idParam, text, optionalText, emailField } from "../lib/validate";
import { normalizePhone } from "../lib/phone";

// Mounted at /api/admin/vendors (admin login required, see routes/index.ts).
const router = Router();

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const vendorFields = {
  name: text("Name", 1, 120),
  contact: optionalText("Contact person", 120),
  email: z.preprocess(blankToNull, emailField.nullable()),
  // Vendors may be abroad or have landlines, so any plausible phone number is accepted.
  phone: z.preprocess(
    blankToNull,
    z.string().trim().regex(/^[\d+\-\s().]{6,25}$/, "Phone number looks invalid").nullable(),
  ),
};

const createSchema = z.object({
  name: vendorFields.name,
  contact: vendorFields.contact.optional().default(null),
  email: vendorFields.email.optional().default(null),
  phone: vendorFields.phone.optional().default(null),
});

const updateSchema = z.object({
  name: vendorFields.name.optional(),
  contact: vendorFields.contact.optional(),
  email: vendorFields.email.optional(),
  phone: vendorFields.phone.optional(),
});

router.get("/", async (req, res) => {
  const p = readPage(req);
  const q = readSearch(req);
  const like = likePattern(q);
  const where = q
    ? or(ilike(vendorsTable.name, like), ilike(vendorsTable.contact, like), ilike(vendorsTable.email, like), ilike(vendorsTable.phone, like))
    : undefined;
  const [{ total }] = await db.select({ total: count() }).from(vendorsTable).where(where);
  const rows = await db.select().from(vendorsTable).where(where)
    .orderBy(desc(vendorsTable.createdAt), desc(vendorsTable.id)).limit(p.pageSize).offset(p.offset);
  res.json(pageOf(rows, Number(total), p));
});

router.post("/", async (req, res) => {
  const d = parse(createSchema, req.body);
  const [vendor] = await db.insert(vendorsTable).values(d).returning();
  res.status(201).json(vendor);
});

router.put("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const d = parse(updateSchema, req.body);
  if (!Object.keys(d).length) throw new HttpError(400, "Nothing to update");
  const [updated] = await db.update(vendorsTable).set(d).where(eq(vendorsTable.id, id)).returning();
  if (!updated) throw new HttpError(404, "Vendor not found");
  res.json(updated);
});

// A hard delete: the vendor row is removed.
router.delete("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const [deleted] = await db.delete(vendorsTable).where(eq(vendorsTable.id, id)).returning();
  if (!deleted) throw new HttpError(404, "Vendor not found");
  res.json({ success: true });
});

export default router;
