import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgBin = path.join(root, '.tools/node_modules/@embedded-postgres/windows-x64/native/bin');
const pgCtl = path.join(pgBin, 'pg_ctl.exe');
const data = path.join(root, '.local/postgres-data');
const log = path.join(root, '.local/postgres.log');
const tsx = path.join(root, 'artifacts/api-server/node_modules/tsx/dist/cli.mjs');

console.log('--- [1/4] Starting local PostgreSQL ---');
spawnSync(pgCtl, ['-D', data, '-l', log, '-o', '-h 127.0.0.1 -p 5433', '-w', 'start'], { stdio: 'inherit' });

let exitCode = 0;
try {
  const require = createRequire(path.join(root, 'lib/db/package.json'));
  const { Client } = require('pg');
  const baseClient = new Client({ connectionString: 'postgresql://dolldime:4a1e6fb8eb1dc559382047ca872e4a525715260c1e8abbeb@127.0.0.1:5433/postgres' });
  await baseClient.connect();
  const testDbRes = await baseClient.query("SELECT 1 FROM pg_database WHERE datname='dolldime_test'");
  if (testDbRes.rowCount === 0) {
    console.log('Creating database dolldime_test...');
    await baseClient.query('CREATE DATABASE "dolldime_test"');
  }
  await baseClient.end();

  console.log('\n--- [2/4] Running Database Migrations ---');
  const migRes = spawnSync(process.execPath, [path.join(root, 'lib/db/migrate.mjs')], {
    env: { ...process.env, DATABASE_URL: 'postgresql://dolldime:4a1e6fb8eb1dc559382047ca872e4a525715260c1e8abbeb@127.0.0.1:5433/dolldime_test' },
    stdio: 'inherit'
  });
  if (migRes.status !== 0) throw new Error('Migration failed');

  console.log('\n--- [3/4] Running Unit Tests ---');
  const unitRes = spawnSync(process.execPath, [tsx, path.join(root, 'artifacts/api-server/src/tests/unit.test.ts')], {
    cwd: path.join(root, 'artifacts/api-server'),
    stdio: 'inherit'
  });
  if (unitRes.status !== 0) {
    console.error('Unit tests failed with code', unitRes.status);
    exitCode = 1;
  }

  console.log('\n--- [4/4] Running End-to-End Tests ---');
  const e2eRes = spawnSync(process.execPath, [tsx, path.join(root, 'artifacts/api-server/src/tests/e2e.ts')], {
    cwd: path.join(root, 'artifacts/api-server'),
    env: {
      ...process.env,
      TEST_DATABASE_URL: 'postgresql://dolldime:4a1e6fb8eb1dc559382047ca872e4a525715260c1e8abbeb@127.0.0.1:5433/dolldime_test'
    },
    stdio: 'inherit'
  });
  if (e2eRes.status !== 0) {
    console.error('E2E tests failed with code', e2eRes.status);
    exitCode = 1;
  }
} catch (err) {
  console.error('Error during test execution:', err);
  exitCode = 1;
} finally {
  console.log('\n--- Stopping local PostgreSQL ---');
  spawnSync(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'inherit' });
}

process.exit(exitCode);
