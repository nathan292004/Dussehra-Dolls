import crypto from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { CancelError, cancelChitPlan, cleanReason } from "./cancel";
import { logger, runWithContext } from "./logger";

// Internal service: only the main API calls it. Customers never reach it directly — the API
// authenticates the customer, then forwards here with the shared CHIT_SERVICE_TOKEN and the
// verified user id. Do not expose this port publicly.

const TRACE_ID = /^[A-Za-z0-9._-]{8,64}$/;
const USER_ID = /^user_[0-9]{6}[A-Za-z]{5}$/;

function tokenMatches(supplied: unknown, expected: string | undefined): boolean {
  if (!expected || typeof supplied !== "string") return false;
  const a = crypto.createHash("sha256").update(supplied).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** The internal token is read once, when the app is created (index.ts checks it is set). */
export function createApp(opts: { internalToken?: string } = {}): Express {
  const internalToken = opts.internalToken ?? process.env.CHIT_SERVICE_TOKEN;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.use((req, res, next) => {
    const incoming = req.headers["x-trace-id"];
    const traceId = typeof incoming === "string" && TRACE_ID.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader("X-Trace-Id", traceId);
    const start = Date.now();
    res.on("finish", () =>
      runWithContext({ traceId, path: req.path }, () =>
        logger[res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"]("request completed", {
          method: req.method,
          status: res.statusCode,
          latencyMs: Date.now() - start,
        }),
      ),
    );
    runWithContext({ traceId, path: req.path }, () => next());
  });

  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", service: "chit-service" });
    } catch {
      res.status(503).json({ status: "unavailable", service: "chit-service" });
    }
  });

  app.use("/internal", (req, res, next) => {
    if (!tokenMatches(req.headers["x-internal-token"], internalToken)) {
      logger.warn("internal call rejected: bad or missing token");
      return res.status(401).json({ error: "Unauthorized", code: "BAD_INTERNAL_TOKEN" });
    }
    return next();
  });

  app.post("/internal/chit-plans/:id/cancel", async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.headers["x-user-id"];
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(404).json({ error: "Chit plan not found.", code: "PLAN_NOT_FOUND" });
    }
    if (typeof userId !== "string" || !USER_ID.test(userId)) {
      return res.status(400).json({ error: "Missing or invalid user id", code: "BAD_USER_ID" });
    }
    const result = await cancelChitPlan({ chitPlanId: id, userId, reason: cleanReason(req.body?.reason) });
    return res.json(result);
  });

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof CancelError) {
      if (err.status >= 500) logger.error("cancel failed", { err });
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if ((err as { type?: string })?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "The request body is not valid JSON.", code: "INVALID_JSON" });
    }
    logger.error("unhandled error", { err });
    return res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
