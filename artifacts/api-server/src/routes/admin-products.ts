import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { and, count, desc, eq, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { HttpError } from "../lib/http-error";
import { likePattern, pageOf, readPage, readSearch } from "../lib/pagination";
import { z, parse, idParam, text, optionalText, rupees } from "../lib/validate";
import { toRupees } from "../lib/money";

// Mounted at /api/admin/products (admin login required, see routes/index.ts).
const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, "Only .jpg, .jpeg, .png, and .webp files are allowed"));
  },
});

// Admin sees the real numbers: stock on the shelf, units held by unpaid checkouts, and what can still be sold.
export const formatProduct = (p: typeof productsTable.$inferSelect) => ({
  ...p,
  availableStock: Math.max(p.stock - p.reservedStock, 0),
  price: toRupees(p.price),
  originalPrice: p.originalPrice ? toRupees(p.originalPrice) : null,
  rating: p.rating ? parseFloat(p.rating) : 0,
});

// ─── Rules for what an admin may send ────────────────────────────────────────
const tagsField = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((t) => t.trim()).filter(Boolean))
  .pipe(z.array(z.string().max(30, "Each tag must be at most 30 characters")).max(15, "At most 15 tags"));

const wholeNumber = (label: string, max: number) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} must be 0 or more`)
    .max(max, `${label} must be at most ${max}`);

const imageUrlField = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().trim().max(500).refine((v) => /^(https?:\/\/|\/)/.test(v), "Image link must be a web address").nullable(),
);

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const productFields = {
  name: text("Name", 1, 120),
  description: optionalText("Description", 2000),
  price: rupees("Price"),
  originalPrice: z.preprocess(blankToNull, rupees("Original price").nullable()),
  category: text("Category", 1, 60),
  imageUrl: imageUrlField,
  stock: wholeNumber("Stock", 1_000_000),
  isFeatured: z.boolean({ invalid_type_error: "Featured must be true or false" }),
  tags: tagsField,
  serialNumber: optionalText("Serial number", 60),
  location: optionalText("Location", 100),
};

const createSchema = z.object({
  name: productFields.name,
  price: productFields.price,
  category: productFields.category,
  description: productFields.description.optional().default(null),
  originalPrice: productFields.originalPrice.optional().default(null),
  imageUrl: productFields.imageUrl.optional().default(null),
  stock: productFields.stock.optional().default(0),
  isFeatured: productFields.isFeatured.optional().default(false),
  tags: productFields.tags.optional().default([]),
  serialNumber: productFields.serialNumber.optional().default(null),
  location: productFields.location.optional().default(null),
});

const updateSchema = z.object({
  name: productFields.name.optional(),
  description: productFields.description.optional(),
  price: productFields.price.optional(),
  originalPrice: productFields.originalPrice.optional(),
  category: productFields.category.optional(),
  imageUrl: productFields.imageUrl.optional(),
  stock: productFields.stock.optional(),
  isFeatured: productFields.isFeatured.optional(),
  tags: productFields.tags.optional(),
  serialNumber: productFields.serialNumber.optional(),
  location: productFields.location.optional(),
  rating: z.coerce.number().min(0, "Rating must be 0 to 5").max(5, "Rating must be 0 to 5").optional(),
  reviewCount: wholeNumber("Review count", 10_000_000).optional(),
});

const listQuery = z.object({
  category: z.string().trim().max(60).optional(),
  listed: z.enum(["true", "false"]).optional(),
  lowStock: z.enum(["true"]).optional(),
});

// ─── Image upload ────────────────────────────────────────────────────────────
router.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) throw new HttpError(400, "No image file uploaded");
  const domain =
    process.env["REPLIT_DEV_DOMAIN"] || req.get("x-forwarded-host") || req.get("host") || "localhost:8080";
  const protocol = process.env.REPLIT_DEV_DOMAIN ? "https" : req.protocol;
  const origin = process.env.API_PUBLIC_ORIGIN || `${protocol}://${domain}`;
  res.json({ url: `${origin.replace(/\/$/, "")}/api/uploads/${req.file.filename}` });
});

// ─── List (paginated) ────────────────────────────────────────────────────────
// ?page=1&pageSize=25&q=search&category=Traditional&listed=true|false&lowStock=true
router.get("/", async (req, res) => {
  const p = readPage(req);
  const q = readSearch(req);
  const f = parse(listQuery, req.query);
  const conditions = [];
  if (q) {
    const like = likePattern(q);
    conditions.push(or(ilike(productsTable.name, like), ilike(productsTable.serialNumber, like), ilike(productsTable.location, like)));
  }
  if (f.category) conditions.push(eq(productsTable.category, f.category));
  if (f.listed) conditions.push(eq(productsTable.isListed, f.listed === "true"));
  if (f.lowStock) conditions.push(sql`${productsTable.stock} - ${productsTable.reservedStock} < 5`);
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(productsTable).where(where);
  const rows = await db.select().from(productsTable).where(where)
    .orderBy(desc(productsTable.createdAt), desc(productsTable.id)).limit(p.pageSize).offset(p.offset);
  res.json(pageOf(rows.map(formatProduct), Number(total), p));
});

// ─── Create / update / delete ────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const d = parse(createSchema, req.body);
  const [product] = await db.insert(productsTable).values(d).returning();
  res.status(201).json(formatProduct(product));
});

router.put("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const { rating, ...d } = parse(updateSchema, req.body);
  const updateData: Partial<typeof productsTable.$inferInsert> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(d)) {
    if (value !== undefined) (updateData as Record<string, unknown>)[key] = value;
  }
  if (rating !== undefined) updateData.rating = rating.toFixed(2);

  // Stock may not be set below the units customers are currently holding in unpaid checkouts.
  const guard = d.stock !== undefined
    ? and(eq(productsTable.id, id), lte(productsTable.reservedStock, d.stock))
    : eq(productsTable.id, id);
  const [updated] = await db.update(productsTable).set(updateData).where(guard).returning();
  if (!updated) {
    const [exists] = await db.select({ reserved: productsTable.reservedStock }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!exists) throw new HttpError(404, "Product not found");
    throw new HttpError(
      409,
      `${exists.reserved} unit(s) are held by customers who are paying right now, so stock cannot be set below ${exists.reserved}. Try again in a few minutes.`,
      "STOCK_HELD",
    );
  }
  res.json(formatProduct(updated));
});

// A hard delete: the product row is removed (orders keep their own copy of the item name and price).
router.delete("/:id", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const [deleted] = await db.delete(productsTable)
    .where(and(eq(productsTable.id, id), eq(productsTable.reservedStock, 0))).returning();
  if (!deleted) {
    const [exists] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
    if (!exists) throw new HttpError(404, "Product not found");
    throw new HttpError(409, "Customers are paying for this product right now. Try again in a few minutes.", "STOCK_HELD");
  }
  res.json({ success: true });
});

router.patch("/:id/toggle-listing", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const [updated] = await db
    .update(productsTable)
    .set({ isListed: sql`NOT ${productsTable.isListed}`, updatedAt: new Date() })
    .where(eq(productsTable.id, id))
    .returning();
  if (!updated) throw new HttpError(404, "Product not found");
  res.json(formatProduct(updated));
});

export default router;
