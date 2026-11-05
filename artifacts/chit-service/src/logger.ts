import { AsyncLocalStorage } from "node:async_hooks";

// Same one-JSON-object-per-line format as the API's logger, with service "chit-service", so logs
// from both can be searched together. The traceId comes from the API that forwarded the request.

type Level = "info" | "warn" | "error";
const context = new AsyncLocalStorage<{ traceId: string; path: string }>();

export const runWithContext = <T>(ctx: { traceId: string; path: string }, fn: () => T): T => context.run(ctx, fn);

function serialize(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  return {
    name: value.name,
    message: value.message,
    ...((value as { code?: unknown }).code !== undefined ? { code: (value as { code?: unknown }).code } : {}),
    ...(process.env.NODE_ENV !== "production" ? { stack: value.stack } : {}),
    ...(value.cause !== undefined ? { cause: serialize(value.cause) } : {}),
  };
}

function write(level: Level, message: string, fields: Record<string, unknown> = {}) {
  const ctx = context.getStore();
  const entry: Record<string, unknown> = { timestamp: new Date().toISOString(), level, service: "chit-service", message, ...ctx };
  for (const [k, v] of Object.entries(fields)) entry[k] = serialize(v);
  (level === "info" ? process.stdout : process.stderr).write(JSON.stringify(entry) + "\n");
}

export const logger = {
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
