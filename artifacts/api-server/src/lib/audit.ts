import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { adminAuditLogTable } from "@workspace/db/schema";

const SECRET_KEYS = /password|token|secret|otp/i;

/** Copy of a request body that is safe to store: secrets removed, long text cut short. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") {
    return typeof value === "string" && value.length > 300 ? value.slice(0, 300) + "…" : value;
  }
  if (depth > 3) return "[nested]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? "[hidden]" : redact(v, depth + 1);
  }
  return out;
}

interface Entry {
  adminId?: number | null;
  adminUsername?: string | null;
  action: string;
  method?: string;
  path?: string;
  entityType?: string | null;
  entityId?: string | null;
  statusCode?: number;
  details?: Record<string, unknown> | null;
  req?: Request;
}

/** Adds one row to the admin audit log. Never throws: a logging problem must not break the admin's action. */
export async function logAdminAction(e: Entry): Promise<void> {
  try {
    await db.insert(adminAuditLogTable).values({
      adminId: e.adminId ?? null,
      adminUsername: e.adminUsername ?? null,
      action: e.action,
      method: e.method ?? e.req?.method ?? null,
      path: e.path ?? (e.req ? e.req.originalUrl.split("?")[0] : null),
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      statusCode: e.statusCode ?? null,
      details: e.details ?? null,
      ip: e.req?.ip ?? null,
      userAgent: e.req?.get("user-agent")?.slice(0, 200) ?? null,
    });
  } catch (err) {
    console.error("[Audit] could not write audit log:", err);
  }
}

/** "/products/12/toggle-listing" -> entity "products", id "12". */
function entityFromPath(path: string): { entityType: string | null; entityId: string | null; verb: string } {
  const parts = path.replace(/^\/+/, "").split("/").filter(Boolean);
  const entityType = parts[0] ?? null;
  const entityId = parts.find((p, i) => i > 0 && /^\d+$/.test(p)) ?? null;
  const verb = parts.filter((p, i) => i > 0 && !/^\d+$/.test(p)).join(".");
  return { entityType, entityId, verb };
}

const METHOD_VERB: Record<string, string> = { POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };

/**
 * Mount on the admin router (after requireAdmin). Every change an admin makes (POST/PUT/PATCH/DELETE)
 * is recorded with who, what and the result, once the response has been sent.
 */
export function auditAdminChanges(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const body = redact(req.body);
  // Worked out now: once the response is sent, Express has put the full URL back in req.path.
  const { entityType, entityId, verb } = entityFromPath(req.path);
  res.on("finish", () => {
    void logAdminAction({
      adminId: req.adminId,
      adminUsername: req.adminUsername,
      action: `${entityType ?? "admin"}.${verb || METHOD_VERB[req.method] || req.method.toLowerCase()}`,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      entityType,
      entityId,
      statusCode: res.statusCode,
      details: body && typeof body === "object" && Object.keys(body as object).length ? (body as Record<string, unknown>) : null,
      req,
    });
  });
  next();
}
