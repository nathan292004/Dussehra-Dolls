import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyToken } from "../lib/customer-credentials";

export interface AuthRequest extends Request {
  userId?: number;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = verifyToken(authHeader.slice(7));
    if (userId === null) return res.status(401).json({ error: "Invalid token" });
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || !user.isActive) return res.status(401).json({ error: "User not found" });
    req.userId = userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
