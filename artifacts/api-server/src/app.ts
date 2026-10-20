import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { requestLogger } from "./middlewares/request-logger";
import router from "./routes";
import path from "path";
import { fileURLToPath } from "url";
import { verifyMetaWhatsAppWebhook, receiveMetaWhatsAppWebhook } from "./routes/meta-whatsapp-webhook";

const app: Express = express();

// ─── Security headers ──────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ───────────────────────────────────────────────────
const allowedHostPatterns = [
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /\.repl\.co$/,
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

// ─── Structured logging ────────────────────────────────────
app.use(requestLogger);

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

// ─── 404 handler ────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Global error handler ───────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const traceId = req.traceId || "unknown";
  console.error(
    JSON.stringify({
      level: "error",
      traceId,
      message: err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
      timestamp: new Date().toISOString(),
    })
  );
  res.status(500).json({
    error: "Internal server error",
    traceId,
  });
});

export default app;
