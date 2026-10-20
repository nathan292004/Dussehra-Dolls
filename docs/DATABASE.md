# DollDime — Database changes (migrations)

How the database is created and changed, and how to do it safely on a live system.

**The rule:** the database is changed *only* by versioned migration files in
[`lib/db/migrations`](../lib/db/migrations). Nobody edits tables by hand, and the old
`drizzle-kit push` command (which silently changes a database to match the code) is no longer
available.

---

## 1. Everyday workflow (a developer changing the database)

1. **Edit the schema** in `lib/db/src/schema/*.ts` (add a column, a table, an index…).
2. **Generate the migration** (does not touch any database):
   ```
   pnpm --filter @workspace/db run generate
   ```
   This writes a new numbered `.sql` file and updates `meta/`. Give it a clear name if you like:
   `pnpm --filter @workspace/db run generate -- --name add_reseller_discount`.
3. **Read the SQL file.** Make sure it does what you meant. If it contains `DROP`, `TRUNCATE` or a
   column type change, stop and read the "Safe patterns" section below.
4. **Apply it locally:** `pnpm --filter @workspace/db run migrate` (the local launcher does this for you).
5. **Run the tests:** `pnpm --filter @workspace/api-server run test:e2e` (needs a throwaway database whose name contains "test").
6. **Commit the schema change, the new `.sql` file and `meta/` together.** Never edit or delete a migration that has already been applied anywhere — add a new one instead.

Useful checks:

| Command | What it tells you |
|---|---|
| `pnpm --filter @workspace/db run migrate:status` | Which migrations a database has applied / still needs. Changes nothing. |
| `pnpm --filter @workspace/db run generate` | If it prints *"No schema changes"*, the code and the migration files agree. If it creates a file, you forgot to commit a migration. |
| `pnpm --filter @workspace/db run check` | Verifies the migration files themselves are consistent. |

Run the last two in CI on every change.

---

## 2. What the migration runner protects you from

`pnpm --filter @workspace/db run migrate` (see `lib/db/migrate.mjs`):

| Protection | Why |
|---|---|
| **One migrator at a time** (database lock) | Two deploys can't run migrations on top of each other. The second one stops with a clear message. |
| **All pending migrations run in one transaction** | Either every change applies or none does. A failure leaves the database exactly as it was. |
| **Destructive statements are refused** unless you add `--allow-destructive` | `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM`, and column type changes can lose data. You must say you mean it. |
| **Production needs `--yes`** (when `NODE_ENV=production`) | A deliberate step after taking a backup. |
| **Lock timeout (15 s)** | If a table is busy, the migration gives up instead of freezing the live app while it waits. Just run it again. |
| **Refuses an unknown database** | A database that has tables but no migration history (built by hand / the old `push`) is never changed silently. |
| **Safety nets in the schema itself** | The database refuses a negative wallet or stock, more units frozen than exist, an "approved *and* rejected" chit plan, a second live account for one phone number, or two live chit plans for the same customer in one plan year. |

Tests for all of the above were run against a real PostgreSQL (see the project's test report).

---

## 3. Setting up a database

**New / empty database (local, staging, production):**
```
pnpm --filter @workspace/db run migrate
```
That builds the whole schema from the files.

**Local development:** `Start-Local.ps1` runs the migrations automatically.
To wipe the local database and start clean (deletes all customers, orders and chit plans):
```
.\Start-Local.ps1 --reset-db
```

**An existing database that was built with the old `push` command:** the runner will refuse it
(by design) and tell you what to do:
* if it only holds test data → recreate the database (for local: `--reset-db`);
* if you are *certain* it already matches the migrations → `migrate -- --baseline` records them as applied without running them.

---

## 4. Deploying a change to production

Follow this order every time.

1. **Back up.** Take a fresh backup (managed database: a snapshot / point-in-time-recovery marker;
   self-managed: `pg_dump --format=custom --file=dolldime-$(date +%F-%H%M).dump "$DATABASE_URL"`).
   Check the backup file/snapshot exists.
2. **Look at what will run:** `migrate:status` against production.
3. **Run the migration *before* the new app version:**
   ```
   NODE_ENV=production pnpm --filter @workspace/db run migrate -- --yes
   ```
   (add `--allow-destructive` only for an intended destructive migration — see below).
4. **Deploy the new application version** (web servers, then the worker).
5. **Check** `/api/readyz`, the admin dashboard, and one test order / login.

Because the migration runs first, **every migration must be compatible with the old app version
that is still running** while it is applied. That is what the "safe patterns" below are for.

Do **not** run migrations automatically on every server start in production: with several servers
that is a race, and a bad migration would take the whole site down. Migrations are a separate,
deliberate deploy step.

### Rolling back

There are no "down" migrations (they are rarely safe). Instead:

* A migration fails → nothing was applied (single transaction). Fix and rerun.
* A migration succeeded but the new app misbehaves → **roll the app back**; the older app still works
  because migrations are additive (see below). Fix forward with a new migration.
* Data was damaged → **restore the backup** from step 1 (this is why step 1 is not optional).

---

## 5. Safe patterns for changes on a live database

The golden rule is **expand, then contract**: never make a change that the currently-running app
version cannot cope with.

| You want to… | Do it safely like this |
|---|---|
| **Add a column** | Add it as *nullable* (or with a default). Deploy. Start writing it. Later, in a separate migration, backfill and (if needed) make it `NOT NULL`. |
| **Add a `NOT NULL` column to a big table** | Never in one step. 1) add nullable, 2) backfill in batches, 3) add the constraint (`... NOT VALID` then `VALIDATE CONSTRAINT`) in a later migration. |
| **Rename a column / table** | Add the new column, write to both, backfill, switch reads, then drop the old one in a *later* release. Never `RENAME` in one step. |
| **Remove a column / table** | Release 1: stop using it in the code. Release 2 (after it is live everywhere and you have a backup): drop it with `--allow-destructive`. |
| **Change a column type** | Add a new column of the new type, copy, switch, drop the old (same as rename). |
| **Add an index on a large table** | A normal `CREATE INDEX` blocks writes. For big tables create it with `CREATE INDEX CONCURRENTLY` in a **separate, hand-run** statement (it cannot run inside the migration transaction), then record the matching migration. Our tables are small today, so a plain index is fine until they are not. |
| **Backfill lots of rows** | In small batches (for example 1,000 rows at a time) from a script, not one giant `UPDATE` inside a migration. |
| **Add a constraint that existing rows might break** | First find the bad rows with a `SELECT` and fix them; then add the constraint. |

---

## 6. Backups and recovery (set these up before launch)

* Use a **managed PostgreSQL** with automatic daily backups and point-in-time recovery
  (Neon, Supabase, RDS, Cloud SQL…).
* **Test a restore** into a scratch database at least once, and again every few months. A backup
  you have never restored is a hope, not a backup.
* Keep production credentials out of git; give the migration step its own database user if your
  provider allows (the web app does not need the right to `DROP`).
* Run PostgreSQL in **UTC**. (All timestamp columns are `timestamp without time zone`.)

---

## 7. Where things live

| Path | What |
|---|---|
| `lib/db/src/schema/` | The schema, written as code (the source of truth you edit) |
| `lib/db/migrations/` | The generated SQL migrations + `meta/` (commit these) |
| `lib/db/migrate.mjs` | The safe migration runner |
| `lib/db/drizzle.config.ts` | Tool configuration |
| `artifacts/api-server/src/tests/e2e.ts` | End-to-end tests (including a check that the database matches the migrations) |
