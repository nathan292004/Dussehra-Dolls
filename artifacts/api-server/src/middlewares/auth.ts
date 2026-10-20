import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyToken } from "../lib/jwt";

export interface AuthRequest extends Request {
  userId?: string;
}

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
      .select({ userId: usersTable.userId, isActive: usersTable.isActive, isDeleted: usersTable.isDeleted })
      .from(usersTable)
      .where(eq(usersTable.userId, verified.sub))
      .limit(1);
    if (!user || user.isDeleted || !user.isActive) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    req.userId = user.userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
