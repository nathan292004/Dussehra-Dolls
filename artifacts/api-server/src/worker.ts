// Background worker: runs the jobs that must happen exactly once per schedule, away from the web
// servers (so running several web servers never means duplicate reminders).
//   - chit payment reminders on the 4th and 10th (tracked, retried on failure)
//   - releasing stock and wallet money held by checkouts that were never paid
// Run it as ONE process:  pnpm --filter @workspace/api-server run start:worker
// (and set RUN_BACKGROUND_JOBS=false on the web servers). Even if two workers ever ran, the
// database claims each reminder once, so nobody would be messaged twice.
import { pool } from "@workspace/db";
import { assertAuthConfigured } from "./lib/jwt";
import { startChitReminderScheduler } from "./lib/chit-reminder-scheduler";
import { startCheckoutSweeper } from "./lib/order-payments";
import { razorpay } from "./lib/razorpay";

assertAuthConfigured();

async function main() {
  await pool.query("SELECT 1");
  console.log("[Worker] Database connected.");
  startChitReminderScheduler();
  startCheckoutSweeper(razorpay);
  console.log("[Worker] Running. Press Ctrl+C to stop.");
}

const shutdown = async (signal: string) => {
  console.log(`[Worker] ${signal} received, shutting down.`);
  await pool.end().catch(() => undefined);
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err) => {
  console.error("[Worker] Fatal:", err);
  process.exit(1);
});
