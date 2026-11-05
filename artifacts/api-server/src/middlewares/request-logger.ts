import { v4 as uuidv4 } from "uuid";
import type { Request, Response, NextFunction } from "express";
import { logger, runWithContext } from "../lib/logger";

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

const TRACE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Reuse a caller's trace id (e.g. the API forwarding to the chit service) only if it looks sane,
  // so a client can't inject arbitrary text into the logs.
  const incoming = req.headers["x-trace-id"];
  const traceId = typeof incoming === "string" && TRACE_ID.test(incoming) ? incoming : uuidv4();
  req.traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);

  const start = Date.now();
  const path = req.originalUrl.split("?")[0];

  res.on("finish", () => {
    const status = res.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    runWithContext({ traceId, method: req.method, path }, () =>
      logger[level]("request completed", {
        status,
        latencyMs: Date.now() - start,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"] || "-",
      }),
    );
  });

  runWithContext({ traceId, method: req.method, path }, () => next());
}
