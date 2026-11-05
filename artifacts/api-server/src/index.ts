import app from "./app";
import { pool } from "@workspace/db";
import { startWhatsAppWorker } from "./lib/whatsapp-worker";
import { startChitReminderScheduler } from "./lib/chit-reminder-scheduler";
import { assertAuthConfigured } from "./lib/jwt";
import { startCheckoutSweeper } from "./lib/order-payments";
import { razorpay } from "./lib/razorpay";
import { logger } from "./lib/logger";

assertAuthConfigured();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function waitForDatabase(retries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query("SELECT 1");
      logger.info(`[DB] Connected successfully (attempt ${attempt})`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[DB] Connection attempt ${attempt}/${retries} failed`, { reason: message });
      if (attempt < retries) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        logger.info(`[DB] Retrying in ${backoff}ms…`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw new Error("[DB] Could not connect after all retry attempts");
}

async function start() {
  await waitForDatabase();

  const server = app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
    // Background jobs (reminders, releasing abandoned checkouts, WhatsApp delivery) run here by
    // default. In production run them in the separate worker instead (`start:worker`) and set
    // RUN_BACKGROUND_JOBS=false on the web servers, so scaling the web servers up never means
    // duplicate work.
    if (process.env.RUN_BACKGROUND_JOBS !== "false") {
      startChitReminderScheduler();
      startCheckoutSweeper(razorpay);
      startWhatsAppWorker();
    }
  });

  // ─── Graceful shutdown ──────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`[Shutdown] ${signal} received, shutting down gracefully…`);

    server.close(async () => {
      logger.info("[Shutdown] HTTP server closed.");

      try {
        await pool.end();
        logger.info("[Shutdown] DB pool drained.");
      } catch (err) {
        logger.error("[Shutdown] Error draining DB pool", { err: err });
      }

      process.exit(0);
    });

    setTimeout(() => {
      logger.error("[Shutdown] Forced exit after 30s timeout.");
      process.exit(1);
    }, 30_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// A promise nobody awaited, or an exception nothing caught, must leave a trace instead of vanishing.
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled promise rejection", { err: reason });
});
process.on("uncaughtException", (err) => {
  logger.error("uncaught exception, exiting", { err });
  process.exit(1);
});

start().catch((err) => {
  logger.error("[Fatal]", { err: err });
  process.exit(1);
});
