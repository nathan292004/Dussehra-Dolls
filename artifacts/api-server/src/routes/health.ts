import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const startTime = Date.now();

router.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

router.get("/readyz", async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    const result = await pool.query("SELECT 1 AS ok");
    checks.database = result.rows[0]?.ok === 1 ? "ok" : "fail";
  } catch (err) {
    checks.database = "fail";
    healthy = false;
  }

  checks.memory =
    process.memoryUsage().heapUsed < 512 * 1024 * 1024 ? "ok" : "warn";

  const statusCode = healthy ? 200 : 503;
  res.status(statusCode).json({
    status: healthy ? "ready" : "not_ready",
    checks,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

export default router;
