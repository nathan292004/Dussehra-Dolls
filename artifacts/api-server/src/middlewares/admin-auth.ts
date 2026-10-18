import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE = "dolldime_admin";
const ttlMs = 12 * 60 * 60 * 1000;

function configured() {
  return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

function signature(payload: string): Buffer {
  return crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(payload).digest();
}

function signedSession(): string {
  const payload = `v1.${Date.now() + ttlMs}.${crypto.randomBytes(12).toString("base64url")}`;
  return `${payload}.${signature(payload).toString("base64url")}`;
}

function validSession(value: string | undefined): boolean {
  if (!configured() || !value) return false;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d+$/.test(parts[1]) || Number(parts[1]) < Date.now()) return false;
  const supplied = Buffer.from(parts[3], "base64url");
  const expected = signature(parts.slice(0, 3).join("."));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function adminLogin(req: Request, res: Response) {
  if (!configured()) return res.status(503).json({ error: "Admin login is not configured" });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const expectedEmail = process.env.ADMIN_EMAIL!.trim().toLowerCase();
  const expectedPassword = process.env.ADMIN_PASSWORD!;
  const a = crypto.createHash("sha256").update(password).digest();
  const b = crypto.createHash("sha256").update(expectedPassword).digest();
  if (email !== expectedEmail || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Invalid admin credentials" });
  }
  res.cookie(COOKIE, signedSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin",
    maxAge: ttlMs,
  });
  return res.json({ ok: true, email: expectedEmail });
}

export function adminMe(req: Request, res: Response) {
  if (!validSession(req.cookies?.[COOKIE])) return res.status(401).json({ error: "Unauthorized" });
  return res.json({ email: process.env.ADMIN_EMAIL });
}

export function adminLogout(_req: Request, res: Response) {
  res.clearCookie(COOKIE, { path: "/api/admin" });
  return res.json({ ok: true });
}

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  if (!validSession(req.cookies?.[COOKIE])) return res.status(401).json({ error: "Unauthorized" });
  return next();
}
