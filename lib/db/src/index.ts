import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Every connection works in UTC. Timestamps are stored as timestamptz; the apps show them in IST.
  options: "-c timezone=UTC",
});
export const db = drizzle(pool, { schema });

export * from "./schema";
