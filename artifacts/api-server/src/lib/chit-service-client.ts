import { logger, currentTraceId } from "./logger";

// Talks to the separate chit-service (artifacts/chit-service). The API has already authenticated
// the customer; it passes their user id and the shared CHIT_SERVICE_TOKEN so the service can
// trust the call. The service is internal: customers never call it directly.

export interface ChitServiceReply {
  status: number;
  body: Record<string, unknown>;
}

const UNAVAILABLE: ChitServiceReply = {
  status: 503,
  body: {
    error: "Chit cancellation is temporarily unavailable. Please try again in a few minutes.",
    code: "CHIT_SERVICE_UNAVAILABLE",
  },
};

export async function cancelChitPlanViaService(opts: { chitPlanId: number; userId: string; reason?: unknown }): Promise<ChitServiceReply> {
  const token = process.env.CHIT_SERVICE_TOKEN;
  if (!token) {
    logger.error("CHIT_SERVICE_TOKEN is not set; cannot reach the chit service");
    return UNAVAILABLE;
  }
  const base = (process.env.CHIT_SERVICE_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/internal/chit-plans/${opts.chitPlanId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
        "X-User-Id": opts.userId,
        ...(currentTraceId() ? { "X-Trace-Id": currentTraceId()! } : {}),
      },
      body: JSON.stringify({ reason: typeof opts.reason === "string" ? opts.reason : undefined }),
      signal: AbortSignal.timeout(10_000),
    });
    let body: Record<string, unknown> = {};
    try { body = (await res.json()) as Record<string, unknown>; } catch { /* empty body */ }
    if (res.status === 401) {
      // The two services disagree on the shared secret: a configuration problem, not the customer's.
      logger.error("chit service rejected our internal token (CHIT_SERVICE_TOKEN differs between services?)");
      return UNAVAILABLE;
    }
    if (res.status >= 500) {
      logger.error("chit service failed", { status: res.status, serviceError: body.code });
      return { status: res.status === 500 ? 500 : 503, body: { error: (body.error as string) || UNAVAILABLE.body.error, code: body.code ?? "CHIT_SERVICE_ERROR" } };
    }
    return { status: res.status, body };
  } catch (err) {
    logger.error("could not reach the chit service", { err, url: base });
    return UNAVAILABLE;
  }
}
