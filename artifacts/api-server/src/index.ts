import app from "./app";
import { pool } from "@workspace/db";
import { startChitReminderScheduler } from "./lib/chit-reminder-scheduler";

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
      console.log(`[DB] Connected successfully (attempt ${attempt})`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[DB] Connection attempt ${attempt}/${retries} failed: ${message}`
      );
      if (attempt < retries) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        console.log(`[DB] Retrying in ${backoff}ms…`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw new Error("[DB] Could not connect after all retry attempts");
}

async function start() {
  await waitForDatabase();

  const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startChitReminderScheduler();
  });

  // ─── Graceful shutdown ──────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n[Shutdown] ${signal} received, shutting down gracefully…`);

    server.close(async () => {
      console.log("[Shutdown] HTTP server closed.");

      try {
        await pool.end();
        console.log("[Shutdown] DB pool drained.");
      } catch (err) {
        console.error("[Shutdown] Error draining DB pool:", err);
      }

      process.exit(0);
    });

    setTimeout(() => {
      console.error("[Shutdown] Forced exit after 30s timeout.");
      process.exit(1);
    }, 30_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});
