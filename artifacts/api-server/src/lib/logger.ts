import { AsyncLocalStorage } from "node:async_hooks";

// One JSON object per line, so a log collector (or `grep`/`jq`) can search by level, traceId,
// path or error code. Everything logged while handling a request automatically carries that
// request's traceId, method and path; the same traceId is returned to the client in the
// X-Trace-Id header and in every 500 response, so a customer-reported error can be found.

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

interface RequestContext {
  traceId: string;
  method?: string;
  path?: string;
}

const context = new AsyncLocalStorage<RequestContext>();
const service = process.env.SERVICE_NAME || "api";

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL || "").toLowerCase() as Level;
  if (configured in LEVELS) return LEVELS[configured];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

/** Runs `fn` with a request context, so every log line inside it carries the traceId. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return context.run(ctx, fn);
}

export function currentTraceId(): string | undefined {
  return context.getStore()?.traceId;
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = { name: err.name, message: err.message };
    const code = (err as { code?: unknown }).code;
    if (code !== undefined) out.code = code;
    const status = (err as { status?: unknown }).status;
    if (status !== undefined) out.status = status;
    if (process.env.NODE_ENV !== "production" && err.stack) out.stack = err.stack;
    if (err.cause !== undefined) out.cause = serializeError(err.cause);
    return out;
  }
  return { message: String(err) };
}

function write(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel()) return;
  const ctx = context.getStore();
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...(ctx ? { traceId: ctx.traceId, method: ctx.method, path: ctx.path } : {}),
  };
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      entry[key] = key === "err" || key === "error" || value instanceof Error ? serializeError(value) : value;
    }
  }
  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ timestamp: entry.timestamp, level, service, message, note: "fields were not serializable" });
  }
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
