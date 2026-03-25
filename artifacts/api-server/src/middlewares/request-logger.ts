import { v4 as uuidv4 } from "uuid";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const traceId = (req.headers["x-trace-id"] as string) || uuidv4();
  req.traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);

  const start = Date.now();

  res.on("finish", () => {
    const latency = Date.now() - start;
    const log = {
      timestamp: new Date().toISOString(),
      traceId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latencyMs: latency,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"] || "-",
      ...(res.statusCode >= 400 && { level: "warn" }),
      ...(res.statusCode >= 500 && { level: "error" }),
      ...(!res.statusCode || res.statusCode < 400 ? { level: "info" } : {}),
    };
    process.stdout.write(JSON.stringify(log) + "\n");
  });

  next();
}
