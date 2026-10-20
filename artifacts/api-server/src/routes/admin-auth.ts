import { Router } from "express";
import { db } from "@workspace/db";
import { adminUsersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { MAX_FAILED_LOGINS, LOCK_MINUTES, isLocked, lockMessage } from "../lib/lockout";
import {
  DUMMY_PASSWORD_HASH,
  signAdminToken,
  verifyAdminPassword,
  ADMIN_TOKEN_TTL_SECONDS,
} from "../lib/admin-auth";
import { requireAdmin, type AdminRequest } from "../middlewares/admin-auth";

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
          return res.status(429).json({ error: lockMessage(lockedUntil), code: "ACCOUNT_LOCKED" });
        }
      }
      return res.status(401).json({ error: "Invalid username or password" });
    }

    await db
      .update(adminUsersTable)
      .set({ lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(adminUsersTable.id, admin.id));

    return res.json({
      token: signAdminToken(admin),
      expiresIn: ADMIN_TOKEN_TTL_SECONDS,
      admin: { id: admin.id, username: admin.username, name: admin.name },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", requireAdmin as any, async (req: AdminRequest, res) => {
  try {
    const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, req.adminId!)).limit(1);
    if (!admin) return res.status(401).json({ error: "Admin login required" });
    return res.json({ id: admin.id, username: admin.username, name: admin.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
