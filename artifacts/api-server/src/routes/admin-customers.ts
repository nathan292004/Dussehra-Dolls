import { Router } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, walletsTable } from "@workspace/db/schema";
import { likePattern, pageOf, readPage, readSearch } from "../lib/pagination";
import { z, parse } from "../lib/validate";
import { toRupees } from "../lib/money";

// Customers and their wallets. Mounted at /api/admin (admin login required, see routes/index.ts).
const router = Router();

const fullName = sql<string>`concat_ws(' ', ${usersTable.fname}, ${usersTable.lname})`;

const usersQuery = z.object({ status: z.enum(["active", "closed", "inactive"]).optional() });

// ?page=1&pageSize=25&q=name, phone or user id&status=active|closed|inactive
router.get("/users", async (req, res) => {
  const p = readPage(req);
  const q = readSearch(req);
  const f = parse(usersQuery, req.query);
  const conditions = [];
  if (f.status === "closed") conditions.push(eq(usersTable.isDeleted, true));
  if (f.status === "active") conditions.push(and(eq(usersTable.isDeleted, false), eq(usersTable.isActive, true)));
  if (f.status === "inactive") conditions.push(and(eq(usersTable.isDeleted, false), eq(usersTable.isActive, false)));
  if (q) {
    const like = likePattern(q);
    conditions.push(sql`(${fullName} ilike ${like} or ${usersTable.phone} ilike ${like} or ${usersTable.userId} ilike ${like})`);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(usersTable).where(where);
  const rows = await db
    .select({
      userId: usersTable.userId,
      index: usersTable.index,
      fname: usersTable.fname,
      lname: usersTable.lname,
      name: fullName,
      phone: usersTable.phone,
      address: usersTable.address,
      addressLink: usersTable.addressLink,
      isReseller: usersTable.isReseller,
      resellerCode: usersTable.resellerCode,
      isActive: usersTable.isActive,
      isDeleted: usersTable.isDeleted,
      deletedAt: usersTable.deletedAt,
      deletionReason: usersTable.deletionReason,
      registeredAt: usersTable.registeredAt,
      lastActiveAt: usersTable.lastActiveAt,
    })
    .from(usersTable)
    .where(where)
    .orderBy(desc(usersTable.index))
    .limit(p.pageSize)
    .offset(p.offset);
  res.json(pageOf(rows, Number(total), p));
});

// ?page=1&pageSize=25&q=name, phone or user id&released=true|false
router.get("/wallets", async (req, res) => {
  const p = readPage(req);
  const q = readSearch(req);
  const released = req.query.released === "true" ? true : req.query.released === "false" ? false : null;
  const conditions = [];
  if (released !== null) conditions.push(eq(walletsTable.isReleased, released));
  if (q) {
    const like = likePattern(q);
    conditions.push(sql`(${fullName} ilike ${like} or ${usersTable.phone} ilike ${like} or ${walletsTable.userId} ilike ${like})`);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(walletsTable)
    .leftJoin(usersTable, eq(walletsTable.userId, usersTable.userId))
    .where(where);
  const rows = await db
    .select({
      id: walletsTable.id,
      userId: walletsTable.userId,
      balance: walletsTable.balance,
      chitLockedBalance: walletsTable.chitLockedBalance,
      isReleased: walletsTable.isReleased,
      releasedAt: walletsTable.releasedAt,
      updatedAt: walletsTable.updatedAt,
      userName: fullName,
      userPhone: usersTable.phone,
    })
    .from(walletsTable)
    .leftJoin(usersTable, eq(walletsTable.userId, usersTable.userId))
    .where(where)
    .orderBy(desc(walletsTable.updatedAt), desc(walletsTable.id))
    .limit(p.pageSize)
    .offset(p.offset);
  res.json(
    pageOf(
      rows.map((w) => ({ ...w, balance: toRupees(w.balance), chitLockedBalance: toRupees(w.chitLockedBalance) })),
      Number(total),
      p,
    ),
  );
});

export default router;
