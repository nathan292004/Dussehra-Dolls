import crypto from "crypto";
import jwt from "jsonwebtoken";

// Two kinds of signed tokens, each with its own secret and audience, so a customer token
// can never be used as an admin token (or the other way round).
//   customer: JWT_SECRET        (aud "dolldime-customer", up to 1 year, see below)
//   admin:    ADMIN_TOKEN_SECRET (aud "dolldime-admin",    12 hours)
// Only HS256 is accepted when verifying, which blocks "alg: none" and algorithm-swap tricks.
//
// Customer sessions are "sliding": the token itself is long-lived, but the server signs a customer
// out after CUSTOMER_INACTIVITY_DAYS (60) without use (middlewares/auth.ts). Every use renews it.
const ISSUER = "dolldime";
export const CUSTOMER_INACTIVITY_DAYS = 60;

export type TokenKind = "customer" | "admin";

const CONFIG: Record<TokenKind, { env: string; audience: string; expiresInSeconds: number }> = {
  customer: { env: "JWT_SECRET", audience: "dolldime-customer", expiresInSeconds: 365 * 24 * 60 * 60 },
  admin: { env: "ADMIN_TOKEN_SECRET", audience: "dolldime-admin", expiresInSeconds: 12 * 60 * 60 },
};

export const CUSTOMER_TOKEN_TTL_SECONDS = CONFIG.customer.expiresInSeconds;
export const ADMIN_TOKEN_TTL_SECONDS = CONFIG.admin.expiresInSeconds;

const cachedSecrets: Partial<Record<TokenKind, string>> = {};

function secretFor(kind: TokenKind): string {
  const cached = cachedSecrets[kind];
  if (cached) return cached;
  const { env } = CONFIG[kind];
  const fromEnv = process.env[env];
  let secret: string;
  if (fromEnv && fromEnv.length >= 32) {
    secret = fromEnv;
  } else if (process.env.NODE_ENV === "production") {
    throw new Error(`${env} (at least 32 characters) is required in production`);
  } else {
    console.warn(`[Auth] ${env} not set; using a temporary secret. Everyone is logged out when the server restarts.`);
    secret = crypto.randomBytes(32).toString("hex");
  }
  cachedSecrets[kind] = secret;
  return secret;
}

/** The signing secret, for keyed hashes made elsewhere (one-time codes). */
export function signingSecret(kind: TokenKind): string {
  return secretFor(kind);
}

/** Call at startup so a missing secret in production stops the server immediately. */
export function assertAuthConfigured(): void {
  secretFor("customer");
  secretFor("admin");
}

export function signToken(kind: TokenKind, subject: string | number, extra: Record<string, unknown> = {}): string {
  const { audience, expiresInSeconds } = CONFIG[kind];
  return jwt.sign(extra, secretFor(kind), {
    algorithm: "HS256",
    subject: String(subject),
    audience,
    issuer: ISSUER,
    expiresIn: expiresInSeconds,
  });
}

/** Returns the subject (the user id) and any extra claims if the token is valid and unexpired, otherwise null. */
export function verifyToken(kind: TokenKind, token: string): { sub: string; claims: jwt.JwtPayload } | null {
  try {
    const claims = jwt.verify(token, secretFor(kind), {
      algorithms: ["HS256"],
      audience: CONFIG[kind].audience,
      issuer: ISSUER,
    }) as jwt.JwtPayload;
    if (typeof claims.sub !== "string" || !claims.sub) return null;
    return { sub: claims.sub, claims };
  } catch {
    return null;
  }
}
