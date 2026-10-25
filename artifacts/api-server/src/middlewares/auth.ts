import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyToken, CUSTOMER_INACTIVITY_DAYS } from "../lib/jwt";

const INACTIVITY_MS = CUSTOMER_INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
// "Last active" is refreshed at most this often, so a busy customer doesn't cause a write on every request.
const TOUCH_EVERY_MS = 60 * 60 * 1000;

declare global {
  namespace Express {
    interface Request {
      /** Set by authMiddleware: the signed-in customer. */
      userId?: string;
    }
  }
}

/** Kept as a name for readability in routes; the signed-in customer is on every Request. */
export type AuthRequest = Request;

/**
 * Requires a valid customer JWT (Authorization: Bearer <token>) for an account that
 * still exists: deleted or deactivated accounts are rejected even if the token is unexpired.
 */
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const verified = verifyToken("customer", header.slice(7));
    if (!verified) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    const [user] = await db
      .select({
        userId: usersTable.userId,
        isActive: usersTable.isActive,
        isDeleted: usersTable.isDeleted,
        lastActiveAt: usersTable.lastActiveAt,
      })
      .from(usersTable)
      .where(eq(usersTable.userId, verified.sub))
      .limit(1);
    if (!user || user.isDeleted || !user.isActive) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    // Not used for 60 days: the session has lapsed and the customer signs in again.
    const idleMs = Date.now() - user.lastActiveAt.getTime();
    if (idleMs > INACTIVITY_MS) {
      return res.status(401).json({
        error: `You were signed out after ${CUSTOMER_INACTIVITY_DAYS} days of inactivity. Please sign in again.`,
        code: "SESSION_INACTIVE",
      });
    }
    if (idleMs > TOUCH_EVERY_MS) {
      await db.update(usersTable).set({ lastActiveAt: new Date() }).where(eq(usersTable.userId, user.userId));
    }
    req.userId = user.userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
