import { defineConfig } from "drizzle-kit";
import path from "path";

// Database changes are made ONLY through versioned migration files in ./migrations
// (see docs/DATABASE.md). `drizzle-kit push` is not used.
// Run the commands from lib/db (`pnpm --filter @workspace/db run generate`).
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts").replace(/\\/g, "/"),
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Only needed by commands that connect (not by `generate`).
    url: process.env.DATABASE_URL ?? "postgresql://not-configured",
  },
});
