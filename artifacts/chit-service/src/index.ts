import { pool } from "@workspace/db";
import { createApp } from "./app";
import { logger } from "./logger";

const token = process.env.CHIT_SERVICE_TOKEN;
if (!token || token.length < 32) {
  throw new Error("CHIT_SERVICE_TOKEN must be set to a random secret of at least 32 characters (the same value as in the API).");
}

const port = Number(process.env.CHIT_SERVICE_PORT || process.env.PORT || 3002);
if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid port: ${port}`);
// Internal only: listen on localhost unless told otherwise (e.g. a private network in production).
const host = process.env.CHIT_SERVICE_HOST || "127.0.0.1";

process.on("unhandledRejection", (reason) => logger.error("unhandled promise rejection", { err: reason }));
process.on("uncaughtException", (err) => {
  logger.error("uncaught exception, exiting", { err });
  process.exit(1);
});

async function start() {
  await pool.query("SELECT 1");
  const server = createApp().listen(port, host, () => logger.info(`chit-service listening on ${host}:${port}`));
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => void pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  logger.error("chit-service failed to start", { err });
  process.exit(1);
});
