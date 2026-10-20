// Applies database migrations safely.
//
//   pnpm --filter @workspace/db run migrate              apply pending migrations
//   pnpm --filter @workspace/db run migrate -- --status  show applied / pending, change nothing
//   pnpm --filter @workspace/db run migrate -- --yes     required when NODE_ENV=production
//   pnpm --filter @workspace/db run migrate -- --allow-destructive   permit DROP/TRUNCATE/type changes
//   pnpm --filter @workspace/db run migrate -- --baseline            mark an existing database as up to date
//
// Safety rules (see docs/DATABASE.md):
//  * only one migrator can run at a time (database advisory lock)
//  * all pending migrations run in ONE transaction: either all apply or none do
//  * statements that can destroy data are refused unless --allow-destructive is given
//  * in production an explicit --yes is required (after taking a backup)
//  * a lock timeout stops a migration from freezing the live app while it waits for a table lock
//  * a database built by hand / with the old `push` command is refused, never silently changed
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.join(here, "migrations");
const args = new Set(process.argv.slice(2));
const LOCK_KEY = 727274; // arbitrary, shared by every migrator of this project

const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exitCode = 1; };

if (!process.env.DATABASE_URL) { fail("DATABASE_URL is not set."); process.exit(1); }
if (!fs.existsSync(path.join(folder, "meta", "_journal.json"))) {
  fail("No migrations found. Create one with `pnpm --filter @workspace/db run generate`."); process.exit(1);
}

const journal = JSON.parse(fs.readFileSync(path.join(folder, "meta", "_journal.json"), "utf8"));
const entries = journal.entries.map((e) => {
  const sql = fs.readFileSync(path.join(folder, `${e.tag}.sql`), "utf8");
  return { tag: e.tag, when: e.when, sql, hash: crypto.createHash("sha256").update(sql).digest("hex") };
});

const DESTRUCTIVE = [
  [/\bDROP\s+TABLE\b/i, "DROP TABLE"],
  [/\bDROP\s+COLUMN\b/i, "DROP COLUMN"],
  [/\bDROP\s+SCHEMA\b/i, "DROP SCHEMA"],
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/\bDELETE\s+FROM\b/i, "DELETE FROM"],
  [/\bALTER\s+COLUMN\b[^;]*\bSET\s+DATA\s+TYPE\b/i, "ALTER COLUMN ... TYPE"],
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const got = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
  if (!got.rows[0].ok) { fail("Another migration is already running. Wait for it to finish."); process.exit(1); }

  const hasHistory = (await client.query(
    "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS yes")).rows[0].yes;
  const hasAppTables = (await client.query(
    "SELECT to_regclass('public.users') IS NOT NULL AS yes")).rows[0].yes;

  let applied = [];
  if (hasHistory) {
    applied = (await client.query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at")).rows;
  }
  const lastApplied = applied.length ? Math.max(...applied.map((r) => Number(r.created_at))) : null;
  const pending = entries.filter((e) => lastApplied === null || e.when > lastApplied);

  if (args.has("--baseline")) {
    if (hasHistory && applied.length) { fail("This database already has migration history. Nothing to baseline."); process.exit(1); }
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
    for (const e of entries) {
      await client.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [e.hash, e.when]);
    }
    console.log(`✔ Marked ${entries.length} migration(s) as already applied. Only use this when the database really matches them.`);
    process.exit(0);
  }

  console.log(`Database: ${new URL(process.env.DATABASE_URL).host}${new URL(process.env.DATABASE_URL).pathname}`);
  console.log(`Applied: ${applied.length}   Pending: ${pending.length}`);
  for (const e of pending) console.log(`  → ${e.tag}`);

  if (args.has("--status")) process.exit(0);

  if (!hasHistory && hasAppTables) {
    fail(
      "This database already has tables but no migration history (it was probably built with the old `push` command).\n" +
      "  • If it only holds test data: drop and recreate the database, then run migrate again\n" +
      "    (for the local launcher: run Start-Local.ps1 with --reset-db).\n" +
      "  • If it truly matches the migrations already: run with --baseline once.\n" +
      "Nothing was changed.",
    );
    process.exit(1);
  }

  if (!pending.length) { console.log("✔ Database is up to date."); process.exit(0); }

  const flagged = [];
  for (const e of pending) {
    for (const [re, label] of DESTRUCTIVE) if (re.test(e.sql)) flagged.push(`${e.tag}: ${label}`);
  }
  if (flagged.length && !args.has("--allow-destructive")) {
    fail(
      "These migrations contain statements that can destroy data:\n  - " + flagged.join("\n  - ") +
      "\nTake a backup, make sure it is intended, then re-run with --allow-destructive.\nNothing was changed.",
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && !args.has("--yes")) {
    fail("NODE_ENV is production. Take a backup, then re-run with --yes to confirm.\nNothing was changed.");
    process.exit(1);
  }

  // Do not wait forever behind a long query holding a table lock (that would stall the live app).
  await client.query("SET lock_timeout = '15s'");
  await client.query("SET statement_timeout = '10min'");

  const db = drizzle(client);
  await migrate(db, { migrationsFolder: folder });
  console.log(`✔ Applied ${pending.length} migration(s).`);
} catch (err) {
  fail(`Migration failed and was rolled back: ${err instanceof Error ? err.message : err}`);
} finally {
  await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
  await client.end();
}
