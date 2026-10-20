import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { adminUsersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyAdminToken } from "../lib/admin-auth";

export interface AdminRequest extends Request {
  adminId?: number;
}

/** Protects every admin route. Requires a valid, unexpired token for an active admin account. */
export async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Admin login required" });
    }
    const payload = verifyAdminToken(header.slice(7));
    if (!payload) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    const [admin] = await db
      .select({ id: adminUsersTable.id, isActive: adminUsersTable.isActive })
      .from(adminUsersTable)
      .where(eq(adminUsersTable.id, payload.sub))
      .limit(1);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: "Admin account is not active" });
    }
    req.adminId = admin.id;
    return next();
  } catch (err) {
    console.error("[AdminAuth] error", err);
    return res.status(401).json({ error: "Admin login required" });
  }
}
