import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { requestLogger } from "./middlewares/request-logger";
import router from "./routes";
import path from "path";
import { fileURLToPath } from "url";
import { HttpError } from "./lib/http-error";
import { verifyMetaWhatsAppWebhook, receiveMetaWhatsAppWebhook } from "./routes/meta-whatsapp-webhook";
import { accountDeletionPage } from "./routes/account-deletion-page";
import { logger } from "./lib/logger";

const app: Express = express();

// First, so every request (including rate-limited ones, webhooks and bad JSON) gets a traceId and a log line.
app.use(requestLogger);

// ─── Security headers ──────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ───────────────────────────────────────────────────
const allowedHostPatterns = [
  /^localhost$/,
  /^127\.0\.0\.1$/,
  /\.expo\.dev$/,
  /\.expo\.direct$/,
  /\.expo\.io$/,
];

function isAllowedOrigin(origin: string): boolean {
  if ((process.env.CORS_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).includes(origin)) return true;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const { hostname } = new URL(origin);
    return allowedHostPatterns.some((p) => p.test(hostname));
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

// Automated tests switch the per-IP limits off (they hammer one IP); production never does.
const skipRateLimitInTests = () => process.env.RATE_LIMITS_OFF === "1";

// ─── Global rate limiter (100 req/min per IP) ───────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  validate: { xForwardedForHeader: false },
  skip: skipRateLimitInTests,
});
// A campaign can generate multiple signed delivery callbacks per message.
app.use((req, res, next) => req.path === "/api/whatsapp/webhook" ? next() : globalLimiter(req, res, next));

// ─── Strict rate limiter for auth (10 req/min per IP) ───────
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please wait." },
  validate: { xForwardedForHeader: false },
  skip: skipRateLimitInTests,
});
app.use("/api/auth", authLimiter);
app.use("/api/admin/auth/login", authLimiter);

// Meta signs raw bytes; this route must precede JSON body parsing.
app.get("/api/whatsapp/webhook", verifyMetaWhatsAppWebhook);
app.post("/api/whatsapp/webhook", express.raw({ type: "application/json", limit: "256kb" }), receiveMetaWhatsAppWebhook);

// --- Admin login: 10 attempts per 15 minutes per IP ---
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  validate: { xForwardedForHeader: false },
  skip: skipRateLimitInTests,
});
app.use("/api/admin/auth/login", adminLoginLimiter);

// ─── Body parsers ───────────────────────────────────────────
// rawBody is kept so the Razorpay webhook signature can be checked against the exact bytes sent.
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// ─── Static uploads directory (served under /api/uploads so proxy routes it) ─
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "uploads");
app.use("/api/uploads", (_req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
}, express.static(uploadsDir));

// ─── Routes ─────────────────────────────────────────────────
app.use("/api", router);

// Public page Google Play links to for account deletion (no app install needed).
app.get("/account-deletion", accountDeletionPage);

// ─── 404 handler ────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not found", traceId: req.traceId });
});

// ─── Global error handler ───────────────────────────────────
// Routes can simply `throw new HttpError(...)` (or let any error escape): Express 5 sends it here.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const traceId = req.traceId;
  if (res.headersSent) {
    logger.error("error after the response was already sent", { err });
    return;
  }
  if (err instanceof HttpError) {
    if (err.status >= 500) logger.error("request failed", { err });
    return res.status(err.status).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...err.extra,
      traceId,
    });
  }
  // Errors raised by express.json() / urlencoded() for a bad request body are the client's fault.
  const bodyError = err as { type?: string; status?: number };
  if (bodyError?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "The request body is not valid JSON.", code: "INVALID_JSON", traceId });
  }
  if (bodyError?.type === "entity.too.large") {
    return res.status(413).json({ error: "The request body is too large.", code: "PAYLOAD_TOO_LARGE", traceId });
  }
  // Image uploads (multer): too big, too many files, unexpected field — all the client's to fix.
  const uploadError = err as { name?: string; code?: string };
  if (uploadError?.name === "MulterError") {
    const tooLarge = uploadError.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? "The image must be 5 MB or smaller." : "The upload was not in the expected format.",
      code: uploadError.code,
      traceId,
    });
  }
  logger.error("unhandled error", { err });
  return res.status(500).json({ error: "Internal server error", traceId });
});

export default app;
