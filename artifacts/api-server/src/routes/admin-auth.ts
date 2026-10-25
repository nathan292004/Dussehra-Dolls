import { Router } from "express";
import { db } from "@workspace/db";
import { adminUsersTable, adminAuditLogTable } from "@workspace/db/schema";
import { desc, eq, ilike, and, sql, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import { MAX_FAILED_LOGINS, LOCK_MINUTES, isLocked, lockMessage } from "../lib/lockout";
import {
  DUMMY_PASSWORD_HASH,
  signAdminToken,
  verifyAdminPassword,
  ADMIN_TOKEN_TTL_SECONDS,
} from "../lib/admin-auth";
import { requireAdmin } from "../middlewares/admin-auth";
import { logAdminAction } from "../lib/audit";
import { pageOf, readPage, readSearch, likePattern } from "../lib/pagination";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (
      typeof username !== "string" || typeof password !== "string" ||
      !username || !password || password.length > 256
    ) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const [admin] = await db
      .select()
      .from(adminUsersTable)
      .where(eq(adminUsersTable.username, username.trim().toLowerCase()))
      .limit(1);

    const now = new Date();
    if (admin && isLocked(admin.lockedUntil, now)) {
      return res.status(429).json({ error: lockMessage(admin.lockedUntil!, now), code: "ACCOUNT_LOCKED" });
    }
    // A lock that has run out starts the count again.
    if (admin && admin.lockedUntil && !isLocked(admin.lockedUntil, now)) {
      await db.update(adminUsersTable).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(adminUsersTable.id, admin.id));
    }

    // Always run a password check so timing doesn't reveal whether the username exists.
    const ok = await verifyAdminPassword(password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!admin || !admin.isActive || !ok) {
      if (admin) {
        const [updated] = await db
          .update(adminUsersTable)
          .set({ failedLoginAttempts: sql`${adminUsersTable.failedLoginAttempts} + 1` })
          .where(eq(adminUsersTable.id, admin.id))
          .returning({ attempts: adminUsersTable.failedLoginAttempts });
        if (updated && updated.attempts >= MAX_FAILED_LOGINS) {
          const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
          await db.update(adminUsersTable).set({ lockedUntil }).where(eq(adminUsersTable.id, admin.id));
          await logAdminAction({ adminId: admin.id, adminUsername: admin.username, action: "login_locked", entityType: "admin", statusCode: 429, req });
          return res.status(429).json({ error: lockMessage(lockedUntil), code: "ACCOUNT_LOCKED" });
        }
      }
      await logAdminAction({
        adminId: admin?.id, adminUsername: username.trim().toLowerCase().slice(0, 60),
        action: "login_failed", entityType: "admin", statusCode: 401, req,
      });
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // A new login replaces any session that was open before (one live session at a time).
    const sessionId = randomUUID();
    const replaced = !!admin.sessionId;
    await db
      .update(adminUsersTable)
      .set({ lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null, sessionId })
      .where(eq(adminUsersTable.id, admin.id));
    await logAdminAction({
      adminId: admin.id, adminUsername: admin.username, action: "login", entityType: "admin",
      statusCode: 200, details: replaced ? { replacedPreviousSession: true } : null, req,
    });

    return res.json({
      token: signAdminToken(admin, sessionId),
      expiresIn: ADMIN_TOKEN_TTL_SECONDS,
      admin: { id: admin.id, username: admin.username, name: admin.name },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", requireAdmin, async (req, res) => {
  try {
    const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, req.adminId!)).limit(1);
    if (!admin) return res.status(401).json({ error: "Admin login required" });
    return res.json({ id: admin.id, username: admin.username, name: admin.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Ends the live session, so the token can no longer be used.
router.post("/logout", requireAdmin, async (req, res) => {
  await db.update(adminUsersTable).set({ sessionId: null }).where(eq(adminUsersTable.id, req.adminId!));
  await logAdminAction({ adminId: req.adminId, adminUsername: req.adminUsername, action: "logout", entityType: "admin", statusCode: 200, req });
  return res.json({ success: true });
});

// The audit trail, newest first. ?q= searches the action, path or username; ?action= filters one action.
router.get("/audit-log", requireAdmin, async (req, res) => {
  const p = readPage(req, 50);
  const q = readSearch(req);
  const action = readSearch(req, "action", 60);
  const conditions = [];
  if (q) {
    const like = likePattern(q);
    conditions.push(sql`(${adminAuditLogTable.action} ilike ${like} or ${adminAuditLogTable.path} ilike ${like} or ${adminAuditLogTable.adminUsername} ilike ${like})`);
  }
  if (action) conditions.push(ilike(adminAuditLogTable.action, likePattern(action)));
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(adminAuditLogTable).where(where);
  const items = await db.select().from(adminAuditLogTable).where(where)
    .orderBy(desc(adminAuditLogTable.createdAt), desc(adminAuditLogTable.id)).limit(p.pageSize).offset(p.offset);
  return res.json(pageOf(items, Number(total), p));
});

export default router;
